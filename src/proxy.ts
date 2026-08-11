/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  proxy.ts — CORS for browser clients (the website)
 * ============================================================
 *
 *  The native mobile apps do not enforce CORS, but the website
 *  (browser SPA) does. This middleware handles OPTIONS preflight
 *  and attaches CORS headers to /api responses.
 *
 *  Allowed origins come from env CORS_ORIGINS (comma separated).
 *  If unset, the request origin is reflected (safe for Bearer-token
 *  auth — tokens are never auto-attached by the browser).
 * ============================================================
 */

import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

function resolveOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;
  const configured = process.env.CORS_ORIGINS
    ?.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (!configured || configured.length === 0) return requestOrigin; // reflect
  return configured.includes(requestOrigin) ? requestOrigin : null;
}

export function proxy(req: NextRequest) {
  const origin = resolveOrigin(req.headers.get("origin"));
  const isPreflight = req.method === "OPTIONS";

  if (!req.nextUrl.pathname.startsWith("/api")) return NextResponse.next();

  const res = isPreflight ? new NextResponse(null, { status: 204 }) : NextResponse.next();
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS.join(", "));
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    res.headers.set("Access-Control-Max-Age", "86400");
  }
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
