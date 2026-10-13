// Helpers for route handlers: JSON parsing with zod, and a single error→HTTP mapping that never leaks stack traces.
import { NextResponse } from "next/server";
import { z } from "zod";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > 200_000) throw new HttpError(413, "request body too large");
    if (text && !/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) throw new HttpError(415, "send the body as application/json");
    raw = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "request body must be valid JSON");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cross-site request guard for state-changing requests. The app has no login (single local learner), so a
 * page on another origin open in the same browser must not be able to POST here (reset progress, run code).
 * Browsers always send Origin and/or Sec-Fetch-Site on cross-site POSTs; non-browser clients (tests, curl)
 * send neither and are allowed. JSON bodies must also be declared as JSON, which forces a CORS preflight.
 */
export function assertSameOrigin(req: Request) {
  if (SAFE_METHODS.has(req.method)) return;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "cross-site request rejected");
  const origin = req.headers.get("origin");
  if (origin && origin !== "null") {
    let originHost: string;
    try { originHost = new URL(origin).host; } catch { throw new HttpError(403, "cross-site request rejected"); }
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!host || originHost !== host) throw new HttpError(403, "cross-site request rejected");
  } else if (origin === "null") {
    throw new HttpError(403, "cross-site request rejected");
  }
}

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      if (args[0] instanceof Request) assertSameOrigin(args[0]);
      return await fn(...args);
    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err instanceof HttpError ? err.status : typeof err.status === "number" ? err.status : 500;
      if (status >= 500 && status !== 503) console.error("[api]", err);
      const message = status >= 500 && status !== 503 ? "Something went wrong on the server. Check the app logs (docker compose logs web)." : err.message;
      return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
    }
  };
}

export function intParam(v: string, name = "id"): number {
  // Digits only (no "1e3", "0x10", " 7"), and small enough for a 32-bit id.
  if (!/^[1-9]\d{0,8}$/.test(v)) throw new HttpError(400, `invalid ${name}`);
  const n = Number(v);
  return n;
}
