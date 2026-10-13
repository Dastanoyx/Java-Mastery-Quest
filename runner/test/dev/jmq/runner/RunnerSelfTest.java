package dev.jmq.runner;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * Dependency-free test suite for the runner (JUnit is unavailable offline; see docs/DECISIONS.md D-001).
 * Run: ./runner/test.sh   — exits non-zero on the first failing assertion.
 */
public final class RunnerSelfTest {
    private static int passed;

    private static boolean rejects(JavaSandbox sb, JavaSandbox.Request r) {
        try { sb.execute(r); return false; } catch (IllegalArgumentException | java.io.IOException e) { return true; }
    }

    public static void main(String[] args) throws Exception {
        Path work = Files.createTempDirectory("jmq-runner-test");
        var limits = new JavaSandbox.Limits(5_000, 4_096, 64, 15_000, 8, 128 * 1024);
        var sb = new JavaSandbox(limits, Path.of(System.getProperty("java.home")), work);

        // 1. Plain program output
        var r = sb.execute(req("Main.java", """
                public class Main { public static void main(String[] a) { System.out.println(1 + 2 + "3" + 4 + 5); } }
                """));
        var h = new com.sun.net.httpserver.Headers();
        h.add("Content-Type", "application/json");
        check("server-to-server JSON accepted", RunnerServer.rejectBrowserRequest(h) == null);
        var hOrigin = new com.sun.net.httpserver.Headers();
        hOrigin.add("Content-Type", "application/json");
        hOrigin.add("Origin", "https://evil.example");
        check("browser Origin rejected", RunnerServer.rejectBrowserRequest(hOrigin) != null);
        var hText = new com.sun.net.httpserver.Headers();
        hText.add("Content-Type", "text/plain");
        check("text/plain rejected", RunnerServer.rejectBrowserRequest(hText) != null);
        check("compiles", ok(r));
        check("stdout", "3345\n".equals(run(r).get("stdout")));
        check("exit 0", Long.valueOf(0).equals(toLong(run(r).get("exitCode"))));

        // 2. Compile error with line number
        r = sb.execute(req("Main.java", """
                public class Main {
                  public static void main(String[] a) {
                    int x = 1L;
                  }
                }
                """));
        check("compile fails", !ok(r));
        var d = (List<?>) compile(r).get("diagnostics");
        var first = (Map<?, ?>) d.getFirst();
        check("diagnostic line 3", Long.valueOf(3).equals(toLong(first.get("line"))));
        check("lossy conversion message", String.valueOf(first.get("message")).contains("lossy conversion"));
        check("no run after compile error", r.get("run") == null);

        // 3. Uncaught exception detection
        r = sb.execute(req("Main.java", """
                public class Main { public static void main(String[] a) { int[] x = new int[2]; x[2] = 1; } }
                """));
        var ex = (Map<?, ?>) run(r).get("exception");
        check("exception type", ex != null && "java.lang.ArrayIndexOutOfBoundsException".equals(ex.get("type")));
        check("exit 1", Long.valueOf(1).equals(toLong(run(r).get("exitCode"))));

        // 4. Infinite loop is killed by the timeout
        r = sb.execute(new JavaSandbox.Request(List.of(new JavaSandbox.SourceFile("Main.java",
                "public class Main { public static void main(String[] a) { while (true) {} } }")), null, null, 1500, false));
        check("timeout flagged", Boolean.TRUE.equals(run(r).get("timedOut")));
        check("timeout duration bounded", toLong(run(r).get("durationMs")) < 5000);

        // 5. Output flood is truncated and the process stopped
        r = sb.execute(req("Main.java", """
                public class Main { public static void main(String[] a) { while (true) System.out.println("spam spam spam"); } }
                """));
        check("output truncated", Boolean.TRUE.equals(run(r).get("outputTruncated")));
        check("stdout capped", ((String) run(r).get("stdout")).length() <= 4096);

        // 6. Memory limit enforced
        r = sb.execute(req("Main.java", """
                import java.util.*;
                public class Main { public static void main(String[] a) {
                  List<long[]> hog = new ArrayList<>(); while (true) hog.add(new long[1_000_000]); } }
                """));
        check("OOM reported", Boolean.TRUE.equals(run(r).get("outOfMemory")));

        // 7. Environment is empty (no secrets leak to learner code)
        r = sb.execute(req("Main.java", """
                public class Main { public static void main(String[] a) {
                  System.out.print(System.getenv("RUNNER_TOKEN") + "|" + System.getenv().containsKey("JAVA_TOOL_OPTIONS")); } }
                """));
        check("env cleared", "null|false".equals(run(r).get("stdout")));
        check("no JAVA_TOOL_OPTIONS banner", !((String) run(r).get("stderr")).contains("Picked up"));

        // 7b. Resource bundles: .properties files land on the classpath and are not compiled
        r = sb.execute(new JavaSandbox.Request(List.of(
                new JavaSandbox.SourceFile("Main.java", """
                        import java.util.*;
                        public class Main { public static void main(String[] a) {
                          var b = ResourceBundle.getBundle("Msg", Locale.FRANCE);
                          System.out.print(b.getString("hi") + "|" + b.getString("bye")); } }
                        """),
                new JavaSandbox.SourceFile("Msg.properties", "hi=hello\nbye=goodbye\n"),
                new JavaSandbox.SourceFile("Msg_fr.properties", "hi=bonjour\n")), null, null, 5000, false));
        check("resource bundle lookup with parent fallback", "bonjour|goodbye".equals(run(r).get("stdout")));
        check("properties-only request rejected", rejects(sb, new JavaSandbox.Request(List.of(
                new JavaSandbox.SourceFile("Msg.properties", "x=1")), null, null, 5000, false)));
        check("path-like resource name rejected", sb.validate(new JavaSandbox.Request(List.of(
                new JavaSandbox.SourceFile("../Msg.properties", "x=1")), null, null, 5000, false)) != null);

        // 8. stdin
        r = sb.execute(new JavaSandbox.Request(List.of(new JavaSandbox.SourceFile("Main.java", """
                import java.util.Scanner;
                public class Main { public static void main(String[] a) { var s = new Scanner(System.in);
                  System.out.print(s.nextInt() * 2); } }
                """)), null, "21\n", 5000, false));
        check("stdin", "42".equals(run(r).get("stdout")));

        // 9. Java 25 compact source file + instance main + java.lang.IO
        r = sb.execute(req("Hello.java", """
                void main() {
                    IO.println("compact " + Runtime.version().feature());
                }
                """));
        check("compact source compiles", ok(r));
        check("compact source runs on 25", "compact 25\n".equals(run(r).get("stdout")));

        // 10. Java 25 flexible constructor body
        r = sb.execute(req("Main.java", """
                class Base { Base(int v) { System.out.println("Base " + v); } }
                class Sub extends Base {
                    Sub(int v) { if (v < 0) throw new IllegalArgumentException(); int w = v * 2; super(w); }
                }
                public class Main { public static void main(String[] a) { new Sub(4); } }
                """));
        check("flexible constructor body", "Base 8\n".equals(run(r).get("stdout")));

        // 11. Multi-file program with package
        r = sb.execute(new JavaSandbox.Request(List.of(
                new JavaSandbox.SourceFile("Main.java", "package app; public class Main { public static void main(String[] a){ System.out.print(Util.twice(5)); } }"),
                new JavaSandbox.SourceFile("Util.java", "package app; class Util { static int twice(int x){ return 2*x; } }")),
                null, null, 5000, false));
        check("multi-file package main", "10".equals(run(r).get("stdout")));

        // 12. Request validation
        check("rejects path traversal", sb.validate(new JavaSandbox.Request(List.of(
                new JavaSandbox.SourceFile("../evil.java", "x")), null, null, 1000, false)) != null);
        check("rejects huge timeout", sb.validate(new JavaSandbox.Request(List.of(
                new JavaSandbox.SourceFile("Main.java", "x")), null, null, 999_999, false)) != null);
        check("rejects bad main class", sb.validate(new JavaSandbox.Request(List.of(
                new JavaSandbox.SourceFile("Main.java", "x")), "Main; rm -rf /", null, 1000, false)) != null);

        // 13. Compile-only mode
        r = sb.execute(new JavaSandbox.Request(List.of(new JavaSandbox.SourceFile("Main.java",
                "public class Main { public static void main(String[] a){ System.out.print(1); } }")), null, null, 1000, true));
        check("compile-only does not run", ok(r) && r.get("run") == null);

        // 14. JSON round trip & parser hardening
        var parsed = RunnerServer.parse("{\"files\":[{\"name\":\"Main.java\",\"content\":\"a\\nb\\u0041\"}],\"timeoutMs\":3000}");
        check("json parse", parsed.files().getFirst().content().equals("a\nbA") && parsed.timeoutMs() == 3000);
        boolean threw = false;
        try { Json.parse("[".repeat(100) + "]".repeat(100)); } catch (IllegalArgumentException e) { threw = true; }
        check("json depth limit", threw);

        // 16. Leftover-process rules (OrphanReaper) and subprocess cleanup on timeout
        var active = java.util.Set.of(42L);
        check("reaper: orphan of PID 1 is a leftover", OrphanReaper.isLeftover(77, 1, 10, 1, active));
        check("reaper: never the runner itself", !OrphanReaper.isLeftover(10, 1, 10, 1, active));
        check("reaper: never PID 1", !OrphanReaper.isLeftover(1, 0, 10, 1, active));
        check("reaper: never an active child JVM", !OrphanReaper.isLeftover(42, 10, 10, 10, active));
        check("reaper: not a grandchild of a running job", !OrphanReaper.isLeftover(78, 42, 10, 1, active));
        if (new java.io.File("/bin/sh").canExecute()) {
            var spawn = sb.execute(req("Main.java", """
                    public class Main { public static void main(String[] a) throws Exception {
                        new ProcessBuilder("/bin/sh", "-c", "sleep 31.337").start();
                        while (true) { } } }
                    """));
            check("subprocess job timed out", Boolean.TRUE.equals(run(spawn).get("timedOut")));
            Thread.sleep(300);
            boolean left = ProcessHandle.allProcesses().anyMatch(ph -> ph.info().arguments()
                    .map(as -> java.util.Arrays.asList(as).contains("31.337")).orElse(false));
            check("subprocesses killed with a timed-out job", !left);
        }

        // 15. Work directory is cleaned up
        try (var s = Files.list(work)) { check("work dir cleaned", s.findAny().isEmpty()); }

        System.out.println("RunnerSelfTest: all " + passed + " assertions passed");
    }

    private static JavaSandbox.Request req(String name, String src) {
        return new JavaSandbox.Request(List.of(new JavaSandbox.SourceFile(name, src)), null, null, 5000, false);
    }

    private static boolean ok(Map<String, Object> r) { return Boolean.TRUE.equals(compile(r).get("ok")); }
    private static Map<?, ?> compile(Map<String, Object> r) { return (Map<?, ?>) r.get("compile"); }
    private static Map<?, ?> run(Map<String, Object> r) {
        Object o = r.get("run");
        if (o == null) throw new AssertionError("no run result: " + Json.write(r));
        return (Map<?, ?>) o;
    }
    private static long toLong(Object o) { return o == null ? -1 : ((Number) o).longValue(); }

    private static void check(String name, boolean cond) {
        if (!cond) {
            System.err.println("FAIL: " + name);
            System.exit(1);
        }
        passed++;
        System.out.println("  ok  " + name);
    }
}
