package dev.jmq.runner;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Container healthcheck: GETs http://127.0.0.1:$RUNNER_PORT/health and exits 0 when the runner answers
 * 200 with status "ok", 1 otherwise. Exists because the runtime image ships no curl/wget.
 * Usage: java -cp /app/jmq-runner.jar dev.jmq.runner.HealthCheck
 */
public final class HealthCheck {

    private HealthCheck() {
    }

    public static void main(String[] args) {
        long port = JavaSandbox.envLong("RUNNER_PORT", 8090);
        URI uri = URI.create("http://127.0.0.1:" + port + "/health");
        try {
            HttpClient client = HttpClient.newBuilder()
                    .proxy(HttpClient.Builder.NO_PROXY)
                    .connectTimeout(Duration.ofSeconds(2))
                    .build();
            HttpRequest req = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(3)).GET().build();
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            boolean healthy = res.statusCode() == 200 && res.body().replace(" ", "").contains("\"status\":\"ok\"");
            System.out.println(healthy ? "healthy" : "unhealthy: HTTP " + res.statusCode() + " " + res.body());
            System.exit(healthy ? 0 : 1);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            System.out.println("unhealthy: interrupted");
            System.exit(1);
        } catch (Exception e) {
            System.out.println("unhealthy: " + e);
            System.exit(1);
        }
    }
}
