import { describe, it, expect } from "vitest";
import { z } from "zod";
import { assertSameOrigin, handle, parseBody, json } from "../../src/server/http.ts";

const post = (headers: Record<string, string>, body = "{}") =>
  new Request("http://127.0.0.1:3000/api/reset", { method: "POST", headers: { host: "127.0.0.1:3000", ...headers }, body });

describe("cross-site request guard", () => {
  it("allows same-origin browser POSTs", () => {
    expect(() => assertSameOrigin(post({ origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-origin" }))).not.toThrow();
  });
  it("allows non-browser clients that send neither Origin nor Sec-Fetch-Site", () => {
    expect(() => assertSameOrigin(post({}))).not.toThrow();
  });
  it("rejects a foreign Origin", () => {
    expect(() => assertSameOrigin(post({ origin: "https://evil.example" }))).toThrow(/cross-site/);
  });
  it("rejects Sec-Fetch-Site: cross-site even without Origin", () => {
    expect(() => assertSameOrigin(post({ "sec-fetch-site": "cross-site" }))).toThrow(/cross-site/);
  });
  it("rejects the opaque 'null' origin (sandboxed iframes, file://)", () => {
    expect(() => assertSameOrigin(post({ origin: "null" }))).toThrow(/cross-site/);
  });
  it("never blocks safe methods", () => {
    const get = new Request("http://127.0.0.1:3000/api/search?q=x", { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
    expect(() => assertSameOrigin(get)).not.toThrow();
  });
  it("handle() maps a rejected request to HTTP 403 without running the handler", async () => {
    let ran = false;
    const route = handle(async (_req: Request) => { ran = true; return json({ ok: true }); });
    const res = await route(post({ origin: "https://evil.example", "content-type": "application/json" }));
    expect(res.status).toBe(403);
    expect(ran).toBe(false);
  });
  it("parseBody rejects a body not declared as JSON (text/plain is a CORS 'simple' request)", async () => {
    const route = handle(async (req: Request) => json(await parseBody(req, z.object({}))));
    const res = await route(post({ "content-type": "text/plain" }));
    expect(res.status).toBe(415);
    const ok = await route(post({ "content-type": "application/json" }));
    expect(ok.status).toBe(200);
  });
});

describe("intParam", () => {
  it("accepts plain positive integers only", async () => {
    const { intParam } = await import("../../src/server/http.ts");
    expect(intParam("42")).toBe(42);
    for (const bad of ["0", "-1", "1e3", "0x10", " 7", "4.0", "99999999999999999999", "abc", ""]) expect(() => intParam(bad)).toThrow(/invalid/);
  });
});
