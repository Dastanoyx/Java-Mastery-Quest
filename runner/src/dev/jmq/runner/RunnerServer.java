package dev.jmq.runner;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

/**
 * Java Mastery Quest code runner.
 *
 * <pre>
 * GET  /health   → {"status":"ok","java":"25.0.4", ...}
 * POST /v1/run   → compile (+ run) learner code; see README "Runner API"
 * </pre>
 *
 * Only the JDK is used. Learner code never runs in this process.
 */
public final class RunnerServer {
    private static final Logger LOG = Logger.getLogger("jmq.runner");
    private static final int MAX_BODY = 256 * 1024;

    private final JavaSandbox sandbox;
    private final Semaphore slots;
    private final String token;

    RunnerServer(JavaSandbox sandbox, int maxConcurrent, String token) {
        this.sandbox = sandbox;
        this.slots = new Semaphore(maxConcurrent, true);
        this.token = token;
    }

    public static void main(String[] args) throws IOException {
        int port = (int) JavaSandbox.envLong("RUNNER_PORT", 8090);
        String bind = System.getenv().getOrDefault("RUNNER_BIND", "127.0.0.1");
        int maxConcurrent = (int) JavaSandbox.envLong("RUNNER_MAX_CONCURRENT", 2);
        Path javaHome = Path.of(System.getenv().getOrDefault("RUNNER_JAVA_HOME", System.getProperty("java.home")));
        Path work = Path.of(System.getenv().getOrDefault("RUNNER_WORK_DIR", System.getProperty("java.io.tmpdir")));
        Files.createDirectories(work);
        String token = System.getenv("RUNNER_TOKEN"); // optional shared secret between web and runner

        var sandbox = new JavaSandbox(JavaSandbox.Limits.fromEnv(), javaHome, work);
        OrphanReaper.startIfEnabled(sandbox);
        var server = new RunnerServer(sandbox, maxConcurrent, token);
        HttpServer http = HttpServer.create(new InetSocketAddress(bind, port), 64);
        http.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        http.createContext("/health", server::health);
        http.createContext("/v1/run", server::run);
        http.start();
        LOG.info(() -> "Runner listening on " + bind + ":" + port + " (java " + Runtime.version() + ", max concurrent "
                + maxConcurrent + ")");
        Runtime.getRuntime().addShutdownHook(new Thread(() -> http.stop(1)));
    }

    private void health(HttpExchange ex) throws IOException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", "ok");
        m.put("java", Runtime.version().toString());
        m.put("availableSlots", slots.availablePermits());
        send(ex, 200, m);
    }

    private void run(HttpExchange ex) throws IOException {
        try (ex) {
            if (!"POST".equals(ex.getRequestMethod())) {
                send(ex, 405, Map.of("error", "POST required"));
                return;
            }
            String browserProblem = rejectBrowserRequest(ex.getRequestHeaders());
            if (browserProblem != null) {
                send(ex, browserProblem.startsWith("content") ? 415 : 403, Map.of("error", browserProblem));
                return;
            }
            if (token != null && !token.isBlank()
                    && !("Bearer " + token).equals(ex.getRequestHeaders().getFirst("Authorization"))) {
                send(ex, 401, Map.of("error", "unauthorized"));
                return;
            }
            JavaSandbox.Request req;
            try {
                req = parse(readBody(ex.getRequestBody()));
            } catch (RuntimeException e) {
                send(ex, 400, Map.of("error", "Invalid request: " + e.getMessage()));
                return;
            }
            String invalid = sandbox.validate(req);
            if (invalid != null) {
                send(ex, 400, Map.of("error", invalid));
                return;
            }
            if (!slots.tryAcquire(20, TimeUnit.SECONDS)) {
                send(ex, 503, Map.of("error", "Runner busy, try again"));
                return;
            }
            try {
                send(ex, 200, sandbox.execute(req));
            } finally {
                slots.release();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            LOG.warning("Run failed: " + e);
            try {
                send(ex, 500, Map.of("error", "Runner internal error"));
            } catch (IOException ignored) {
                // response already started
            }
        }
    }

    /**
     * Only the web app's server talks to the runner. A web page in the learner's browser must never be able to
     * use it: browsers always attach {@code Origin} to cross-origin POSTs, and a {@code text/plain} body is a
     * CORS "simple" request that would otherwise skip the preflight. Returns a reason to reject, or null.
     */
    static String rejectBrowserRequest(com.sun.net.httpserver.Headers h) {
        if (h.getFirst("Origin") != null || h.getFirst("Sec-Fetch-Site") != null) return "browser requests are not accepted";
        String ct = h.getFirst("Content-Type");
        if (ct == null || !ct.toLowerCase(java.util.Locale.ROOT).startsWith("application/json")) return "content type must be application/json";
        return null;
    }

    @SuppressWarnings("unchecked")
    static JavaSandbox.Request parse(String body) {
        Object root = Json.parse(body);
        if (!(root instanceof Map<?, ?> m)) throw new IllegalArgumentException("object expected");
        Object filesObj = m.get("files");
        if (!(filesObj instanceof List<?> rawFiles)) throw new IllegalArgumentException("files[] required");
        List<JavaSandbox.SourceFile> files = new ArrayList<>();
        for (Object o : rawFiles) {
            if (!(o instanceof Map<?, ?> f)) throw new IllegalArgumentException("file must be an object");
            files.add(new JavaSandbox.SourceFile((String) f.get("name"), (String) f.get("content")));
        }
        long timeout = m.get("timeoutMs") instanceof Number n ? n.longValue() : 5000;
        return new JavaSandbox.Request(files, (String) m.get("mainClass"), (String) m.get("stdin"), timeout,
                Boolean.TRUE.equals(m.get("compileOnly")));
    }

    private static String readBody(InputStream in) throws IOException {
        byte[] data = in.readNBytes(MAX_BODY + 1);
        if (data.length > MAX_BODY) throw new IllegalArgumentException("body too large");
        return new String(data, StandardCharsets.UTF_8);
    }

    private static void send(HttpExchange ex, int status, Object body) throws IOException {
        byte[] bytes = Json.write(body).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }
}
