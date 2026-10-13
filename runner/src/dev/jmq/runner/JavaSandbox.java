package dev.jmq.runner;

import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Compiles learner code in-process (annotation processing disabled, so no learner code runs at
 * compile time) and executes it in a separate, resource-limited child JVM inside a throw-away
 * directory with an empty environment.
 *
 * <p>The child JVM is the unit of isolation inside the runner container; the container itself
 * (non-root, read-only rootfs, no network, cgroup limits) is the outer boundary. See docs/ARCHITECTURE.md.
 */
public final class JavaSandbox {

    public record SourceFile(String name, String content) {}

    public record Request(List<SourceFile> files, String mainClass, String stdin, long timeoutMs,
                          boolean compileOnly) {}

    public record Limits(long maxTimeoutMs, int maxOutputBytes, int maxHeapMb, long compileTimeoutMs,
                         int maxFiles, int maxSourceBytes) {
        public static Limits fromEnv() {
            return new Limits(
                    envLong("RUNNER_MAX_TIMEOUT_MS", 10_000),
                    (int) envLong("RUNNER_MAX_OUTPUT_BYTES", 64 * 1024),
                    (int) envLong("RUNNER_MAX_HEAP_MB", 128),
                    envLong("RUNNER_COMPILE_TIMEOUT_MS", 15_000),
                    8,
                    128 * 1024);
        }
    }

    private static final Pattern FILE_NAME = Pattern.compile("[A-Za-z_$][A-Za-z0-9_$]{0,63}\\.java");
    /** Resource files (e.g. resource bundles) are copied verbatim onto the run classpath, never compiled. */
    private static final Pattern RESOURCE_NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]{0,63}\\.properties");
    private static final Pattern CLASS_NAME = Pattern.compile("[A-Za-z_$][A-Za-z0-9_$.]{0,200}");
    private static final Pattern UNCAUGHT = Pattern.compile(
            "Exception in thread \"[^\"]*\" ([A-Za-z0-9_$.]+)(?:: ?(.*))?");

    private final Limits limits;
    private final Path javaBin;
    private final Path workRoot;
    private final JavaCompiler compiler;
    /** PIDs of child JVMs currently running (the orphan reaper must never touch them). */
    private final java.util.Set<Long> activeChildren = java.util.concurrent.ConcurrentHashMap.newKeySet();
    /** Guards "start child + register PID" against a concurrent orphan sweep. */
    private final Object processLock = new Object();
    private volatile Runnable afterRun = () -> {};

    public JavaSandbox(Limits limits, Path javaHome, Path workRoot) {
        this.limits = limits;
        this.javaBin = javaHome.resolve("bin").resolve("java");
        this.workRoot = workRoot;
        this.compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("No system Java compiler (JDK required, not a JRE)");
    }

    java.util.Set<Long> activeChildren() { return activeChildren; }
    Object processLock() { return processLock; }
    /** Hook run after every child JVM has finished (used by {@link OrphanReaper}). */
    void afterRun(Runnable hook) { this.afterRun = hook; }

    public static long envLong(String key, long def) {
        String v = System.getenv(key);
        if (v == null || v.isBlank()) return def;
        return Long.parseLong(v.trim());
    }

    /** Validates a request; returns an error message or null. */
    public String validate(Request r) {
        if (r.files() == null || r.files().isEmpty()) return "At least one source file is required";
        if (r.files().size() > limits.maxFiles()) return "Too many files (max " + limits.maxFiles() + ")";
        long total = 0;
        var seen = new java.util.HashSet<String>();
        for (SourceFile f : r.files()) {
            if (f.name() == null || !(FILE_NAME.matcher(f.name()).matches() || RESOURCE_NAME.matcher(f.name()).matches()))
                return "Invalid file name: " + f.name() + " (expected e.g. Main.java or Messages_fr.properties, no directories)";
            if (!seen.add(f.name())) return "Duplicate file name: " + f.name();
            if (f.content() == null) return "File content missing: " + f.name();
            total += f.content().getBytes(StandardCharsets.UTF_8).length;
        }
        if (total > limits.maxSourceBytes()) return "Source too large";
        if (r.mainClass() != null && !CLASS_NAME.matcher(r.mainClass()).matches()) return "Invalid main class";
        if (r.timeoutMs() <= 0 || r.timeoutMs() > limits.maxTimeoutMs())
            return "timeoutMs must be between 1 and " + limits.maxTimeoutMs();
        if (r.stdin() != null && r.stdin().length() > 16 * 1024) return "stdin too large";
        return null;
    }

    public Map<String, Object> execute(Request r) throws IOException {
        Path dir = Files.createTempDirectory(workRoot, "job-");
        try {
            Path src = Files.createDirectory(dir.resolve("src"));
            Path classes = Files.createDirectory(dir.resolve("classes"));
            Path cwd = Files.createDirectory(dir.resolve("work"));
            List<Path> paths = new ArrayList<>();
            for (SourceFile f : r.files()) {
                boolean resource = RESOURCE_NAME.matcher(f.name()).matches();
                Path base = resource ? classes : src;
                Path p = base.resolve(f.name()).normalize();
                if (!p.getParent().equals(base)) throw new IllegalArgumentException("Path escape");
                Files.writeString(p, f.content(), StandardCharsets.UTF_8);
                if (!resource) paths.add(p);
            }
            if (paths.isEmpty()) throw new IllegalArgumentException("At least one .java file is required");

            Map<String, Object> out = new LinkedHashMap<>();
            Map<String, Object> compile = compile(paths, classes);
            out.put("compile", compile);
            if (!(Boolean) compile.get("ok") || r.compileOnly()) return out;

            String main = r.mainClass() != null ? r.mainClass() : guessMainClass(r.files());
            out.put("run", run(main, classes, cwd, r.stdin(), r.timeoutMs()));
            return out;
        } finally {
            deleteTree(dir);
        }
    }

    private Map<String, Object> compile(List<Path> sources, Path classes) {
        long t0 = System.nanoTime();
        DiagnosticCollector<JavaFileObject> diags = new DiagnosticCollector<>();
        StringWriter javacOut = new StringWriter();
        boolean ok;
        boolean timedOut = false;
        try (StandardJavaFileManager fm = compiler.getStandardFileManager(diags, Locale.ENGLISH, StandardCharsets.UTF_8)) {
            var units = fm.getJavaFileObjectsFromPaths(sources);
            List<String> options = List.of("--release", "25", "-proc:none", "-implicit:none",
                    "-encoding", "UTF-8", "-Xmaxerrs", "20", "-d", classes.toString());
            var task = compiler.getTask(javacOut, fm, diags, options, null, units);
            // Run on a daemon thread so a pathological compile cannot wedge the request forever.
            // (Deliberately not try-with-resources: ExecutorService.close() would wait for a hung task.)
            var exec = Executors.newSingleThreadExecutor(Thread.ofPlatform().daemon().factory());
            var fut = exec.submit(task::call);
            try {
                ok = fut.get(limits.compileTimeoutMs(), TimeUnit.MILLISECONDS);
            } catch (TimeoutException te) {
                fut.cancel(true);
                ok = false;
                timedOut = true;
            } catch (ExecutionException | InterruptedException ee) {
                ok = false;
                javacOut.write("Compiler failure: " + ee.getMessage());
            } finally {
                exec.shutdownNow();
            }
        } catch (IOException e) {
            ok = false;
            javacOut.write("Compiler I/O failure: " + e.getMessage());
        }

        List<Map<String, Object>> list = new ArrayList<>();
        for (Diagnostic<? extends JavaFileObject> d : diags.getDiagnostics()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("kind", d.getKind().name());
            m.put("file", d.getSource() == null ? null : Path.of(d.getSource().toUri()).getFileName().toString());
            m.put("line", d.getLineNumber());
            m.put("column", d.getColumnNumber());
            m.put("code", d.getCode());
            m.put("message", d.getMessage(Locale.ENGLISH));
            list.add(m);
        }
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", ok);
        res.put("timedOut", timedOut);
        res.put("durationMs", (System.nanoTime() - t0) / 1_000_000);
        res.put("diagnostics", list);
        if (!javacOut.toString().isBlank()) res.put("compilerOutput", javacOut.toString());
        return res;
    }

    private Map<String, Object> run(String mainClass, Path classes, Path cwd, String stdin, long timeoutMs)
            throws IOException {
        List<String> cmd = List.of(
                javaBin.toString(),
                "-Xmx" + limits.maxHeapMb() + "m", "-Xss1m",
                "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-XX:-UsePerfData",
                "-XX:ActiveProcessorCount=2",
                "-Djava.awt.headless=true",
                "-Dfile.encoding=UTF-8", "-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8",
                "-Duser.language=en", "-Duser.country=US", "-Duser.timezone=UTC",
                "-cp", classes.toString(), mainClass);
        ProcessBuilder pb = new ProcessBuilder(cmd).directory(cwd.toFile());
        Map<String, String> env = pb.environment();
        env.clear();                         // no secrets, no JAVA_TOOL_OPTIONS, no proxy settings
        env.put("LANG", "C.UTF-8");
        env.put("HOME", cwd.toString());
        env.put("TMPDIR", cwd.toString());

        long t0 = System.nanoTime();
        Process p;
        synchronized (processLock) {
            p = pb.start();
            activeChildren.add(p.pid());
        }
        try {
            return awaitRun(p, stdin, timeoutMs, t0);
        } finally {
            activeChildren.remove(p.pid());
            afterRun.run();
        }
    }

    private Map<String, Object> awaitRun(Process p, String stdin, long timeoutMs, long t0) {
        var stdoutBuf = new CappedBuffer(limits.maxOutputBytes());
        var stderrBuf = new CappedBuffer(limits.maxOutputBytes());
        Thread tOut = Thread.ofVirtual().start(() -> pump(p.getInputStream(), stdoutBuf, p));
        Thread tErr = Thread.ofVirtual().start(() -> pump(p.getErrorStream(), stderrBuf, p));
        try (OutputStream in = p.getOutputStream()) {
            if (stdin != null) in.write(stdin.getBytes(StandardCharsets.UTF_8));
        } catch (IOException ignored) {
            // process may have exited before reading stdin
        }

        boolean finished;
        try {
            finished = p.waitFor(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            finished = false;
        }
        if (!finished) {
            p.descendants().forEach(ProcessHandle::destroyForcibly);
            p.destroyForcibly();
        }
        try {
            p.waitFor(2, TimeUnit.SECONDS);
            tOut.join(2000);
            tErr.join(2000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        String stderr = stderrBuf.text();
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("exitCode", finished ? p.exitValue() : null);
        res.put("timedOut", !finished);
        res.put("durationMs", (System.nanoTime() - t0) / 1_000_000);
        res.put("stdout", stdoutBuf.text());
        res.put("stderr", stderr);
        res.put("outputTruncated", stdoutBuf.truncated() || stderrBuf.truncated());
        Matcher m = UNCAUGHT.matcher(stderr);
        if (m.find()) {
            Map<String, Object> ex = new LinkedHashMap<>();
            ex.put("type", m.group(1));
            ex.put("message", m.group(2));
            res.put("exception", ex);
        }
        if (stderr.contains("java.lang.OutOfMemoryError")) res.put("outOfMemory", true);
        return res;
    }

    private static void pump(InputStream in, CappedBuffer buf, Process p) {
        byte[] b = new byte[8192];
        try (in) {
            int n;
            while ((n = in.read(b)) != -1) {
                if (!buf.write(b, n)) {
                    // Output flood: stop the program rather than buffering unbounded data.
                    p.descendants().forEach(ProcessHandle::destroyForcibly);
                    p.destroyForcibly();
                    return;
                }
            }
        } catch (IOException ignored) {
            // stream closed when the process is killed
        }
    }

    static String guessMainClass(List<SourceFile> files) {
        Pattern pkg = Pattern.compile("^\\s*package\\s+([\\w.]+)\\s*;", Pattern.MULTILINE);
        Pattern mainSig = Pattern.compile("\\bvoid\\s+main\\s*\\(");
        SourceFile pick = null;
        for (SourceFile f : files) {
            if (f.name().equals("Main.java")) { pick = f; break; }
        }
        if (pick == null) {
            for (SourceFile f : files) {
                if (mainSig.matcher(f.content()).find()) { pick = f; break; }
            }
        }
        if (pick == null) pick = files.getFirst();
        String stem = pick.name().substring(0, pick.name().length() - ".java".length());
        Matcher m = pkg.matcher(pick.content());
        return m.find() ? m.group(1) + "." + stem : stem;
    }

    static void deleteTree(Path root) {
        try {
            Files.walkFileTree(root, new SimpleFileVisitor<>() {
                @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    Files.deleteIfExists(file);
                    return FileVisitResult.CONTINUE;
                }
                @Override public FileVisitResult postVisitDirectory(Path d, IOException exc) throws IOException {
                    Files.deleteIfExists(d);
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException ignored) {
            // best effort; the container tmpfs is discarded anyway
        }
    }

    /** Thread-safe byte buffer that stops accepting data past a cap. */
    static final class CappedBuffer {
        private final ByteArrayOutputStream out = new ByteArrayOutputStream();
        private final int cap;
        private boolean truncated;

        CappedBuffer(int cap) { this.cap = cap; }

        synchronized boolean write(byte[] b, int n) {
            int room = cap - out.size();
            if (n > room) {
                out.write(b, 0, Math.max(room, 0));
                truncated = true;
                return false;
            }
            out.write(b, 0, n);
            return true;
        }

        synchronized String text() { return out.toString(StandardCharsets.UTF_8); }
        synchronized boolean truncated() { return truncated; }
    }
}
