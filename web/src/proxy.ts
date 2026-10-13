// Host allow-list (Next.js 16 "proxy", formerly middleware).
//
// The app has no login, so its safety rests on being reachable only from this machine. A DNS-rebinding page
// (attacker.example re-resolving to 127.0.0.1) would otherwise be same-origin with the app and could read
// /api/export or POST answers. Browsers always send the name they resolved in the Host header, so rejecting
// any Host that is not a loopback name (or explicitly allowed) closes that hole for every method, GET included.
import { NextResponse, type NextRequest } from "next/server";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function hostAllowed(hostHeader: string | null, extra: string | undefined = process.env.ALLOWED_HOSTS): boolean {
  if (!hostHeader) return false;
  const h = hostHeader.trim().toLowerCase();
  const name = h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0];
  if (LOOPBACK.has(name) || name.endsWith(".localhost")) return true;
  const allowed = (extra ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(name);
}

export function proxy(request: NextRequest) {
  if (!hostAllowed(request.headers.get("host"))) {
    return new NextResponse("Misdirected request: this app only answers on localhost. Set ALLOWED_HOSTS to add a host name.", {
      status: 421, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return NextResponse.next();
}
