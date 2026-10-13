// Client for the isolated Java runner service. The web app never compiles or executes learner code itself.
import { runnerUrl } from "../config.ts";
import { Unavailable } from "../errors.ts";

export interface RunnerDiagnostic { kind: string; file: string | null; line: number; column: number; message: string }
export interface RunnerResult {
  compile: { ok: boolean; timedOut?: boolean; durationMs?: number; diagnostics: RunnerDiagnostic[] };
  run?: { exitCode: number | null; timedOut: boolean; durationMs: number; stdout: string; stderr: string; outputTruncated: boolean; exception?: { type: string; message?: string }; outOfMemory?: boolean };
}

export async function runnerHealth(): Promise<{ ok: boolean; java?: string; error?: string }> {
  try {
    const r = await fetch(`${runnerUrl()}/health`, { signal: AbortSignal.timeout(2000), cache: "no-store" });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = (await r.json()) as { java: string };
    return { ok: true, java: j.java };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function runJava(files: { name: string; content: string }[], opts: { mainClass?: string; stdin?: string; timeoutMs?: number } = {}): Promise<RunnerResult> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${runnerUrl()}/v1/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.RUNNER_TOKEN ? { Authorization: `Bearer ${process.env.RUNNER_TOKEN}` } : {}) },
      body: JSON.stringify({ files, mainClass: opts.mainClass, stdin: opts.stdin, timeoutMs: opts.timeoutMs ?? 5000 }),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
  } catch {
    throw new Unavailable("The Java runner is not reachable. Start it with `docker compose up runner` (or ./runner/run-local.sh) and try again.");
  }
  if (res.status === 503) throw new Unavailable("The Java runner is busy — try again in a moment.");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Unavailable(body.error ?? `Runner error (HTTP ${res.status})`);
  }
  return (await res.json()) as RunnerResult;
}
