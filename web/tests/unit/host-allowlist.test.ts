import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { hostAllowed, proxy } from "../../src/proxy.ts";

describe("host allow-list (DNS-rebinding protection)", () => {
  it("accepts loopback names with or without a port", () => {
    for (const h of ["localhost:3000", "127.0.0.1:3000", "127.0.0.1", "[::1]:3000", "app.localhost:3000"]) expect(hostAllowed(h, "")).toBe(true);
  });
  it("rejects any other name, including a rebinding domain that resolves to 127.0.0.1", () => {
    for (const h of ["attacker.example:3000", "127.0.0.1.attacker.example", "evil.com", ""]) expect(hostAllowed(h, "")).toBe(false);
    expect(hostAllowed(null, "")).toBe(false);
  });
  it("accepts names listed in ALLOWED_HOSTS", () => {
    expect(hostAllowed("study-box.lan:3000", "study-box.lan, other")).toBe(true);
  });
  it("answers 421 for a foreign Host, even on GET /api/export", () => {
    const bad = proxy(new NextRequest("http://127.0.0.1:3000/api/export", { headers: { host: "attacker.example:3000" } }));
    expect(bad.status).toBe(421);
    const ok = proxy(new NextRequest("http://127.0.0.1:3000/api/export", { headers: { host: "127.0.0.1:3000" } }));
    expect(ok.status).toBe(200);
  });
});
