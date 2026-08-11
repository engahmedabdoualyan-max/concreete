/**
 * ============================================================
 *  API Rate Limiting (Module 6)
 * ============================================================
 *
 *  Two layers are provided:
 *   1. `apiRateLimiter` — express-rate-limit middleware mounted on every
 *      public Express router. 100 requests / minute / IP.
 *   2. `checkNextRateLimit` — a dependency-free, in-memory sliding-window
 *      limiter for Next.js App Router route handlers (which do not run
 *      through Express). Same 100 rpm / IP budget.
 *
 *  Both protect the Supabase backend from mobile-device request floods.
 */

import rateLimit from "express-rate-limit";

// ─── Express layer ────────────────────────────────────────────────────────────

export const RATE_WINDOW_MS = 60_000; // 1 minute
export const RATE_MAX = 100; // requests per window per IP

/** Global limiter for all public Express routers. */
export const apiRateLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: RATE_MAX,
  standardHeaders: true, // RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    errorCode: "RATE_LIMITED",
    message: "Too many requests. Limit is 100 requests per minute per IP.",
  },
  // Trust the left-most X-Forwarded-For entry (behind the load balancer)
  keyGenerator: (req) => {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string") return fwd.split(",")[0].trim();
    return req.ip ?? "unknown";
  },
});

/** A stricter limiter for auth handshakes (login / delete-account). */
export const authRateLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    errorCode: "AUTH_RATE_LIMITED",
    message: "Too many authentication attempts. Please wait a minute.",
  },
});

// ─── Next.js App Router layer ─────────────────────────────────────────────────

interface Bucket {
  hits: number[];
}
const buckets = new Map<string, Bucket>();

export interface NextRateResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
}

/**
 * Sliding-window limiter for Next.js route handlers.
 * Returns whether the request is allowed and how many hits remain.
 *
 * @param key   Usually the client IP (from x-forwarded-for)
 * @param max   Max requests per window (default 100)
 * @param windowMs  Window size (default 60_000)
 */
export function checkNextRateLimit(
  key: string,
  max: number = RATE_MAX,
  windowMs: number = RATE_WINDOW_MS
): NextRateResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const bucket = buckets.get(key) ?? { hits: [] };

  // Drop hits outside the sliding window
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  bucket.hits.push(now);
  buckets.set(key, bucket);

  const allowed = bucket.hits.length <= max;
  const oldest = bucket.hits[0] ?? now;
  return {
    allowed,
    remaining: Math.max(0, max - bucket.hits.length),
    limit: max,
    retryAfterSeconds: allowed ? 0 : Math.ceil((oldest + windowMs - now) / 1000),
  };
}

/** Extracts the client IP from a Next.js request's headers. */
export function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/** Periodically purge idle buckets to bound memory. */
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const cutoff = Date.now() - RATE_WINDOW_MS * 2;
    for (const [key, bucket] of buckets) {
      if (bucket.hits.every((t) => t < cutoff)) buckets.delete(key);
    }
  }, RATE_WINDOW_MS).unref?.();
}
