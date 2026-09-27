/**
 * Server status (web/desktop and native).
 *
 * The first question in almost every support call is "is the server
 * reachable, and is it talking to the database?". This answers it from the
 * device instead of asking the user to run commands, and it distinguishes the
 * three failures that look identical to a user:
 *
 *   • no network / wrong URL        → cannot reach the host
 *   • host answers, API broken      → HTTP error or unexpected body
 *   • API answers, database down    → status "unhealthy" / HTTP 503
 */

import { API_BASE_URL } from "@/types";
import { resolveApiBase } from "./server-url";

export interface ServerStatus {
  /** the base URL that was actually used */
  url: string;
  ok: boolean;
  /** the API's own verdict: "ok" | "unhealthy" | "unknown" */
  api: string;
  /** round-trip time in milliseconds */
  ms: number;
  httpStatus: number | null;
  error?: string;
  checkedAt: string;
}

export async function checkServerStatus(
  timeoutMs = 15000
): Promise<ServerStatus> {
  const url = resolveApiBase(API_BASE_URL);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const base: ServerStatus = {
    url,
    ok: false,
    api: "unknown",
    ms: 0,
    httpStatus: null,
    checkedAt: new Date().toISOString(),
  };

  try {
    const response = await fetch(`${url}/api/health?t=${Date.now()}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const ms = Date.now() - startedAt;
    let body: { status?: string } | null = null;
    try {
      body = await response.json();
    } catch {
      /* not JSON */
    }
    const api = body?.status ?? "unknown";
    return {
      ...base,
      httpStatus: response.status,
      ms,
      api,
      // The health route returns 503 when the database query fails, so a 200
      // plus status "ok" is the only fully healthy combination.
      ok: response.ok && (api === "ok" || api === "healthy"),
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (err) {
    const aborted = (err as Error)?.name === "AbortError";
    return {
      ...base,
      ms: Date.now() - startedAt,
      error: aborted ? "انتهت المهلة — السيرفر بطيء أو محجوب" : "تعذّر الوصول للسيرفر",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** One line in Arabic, ready to show to the user. */
export function describeServerStatus(s: ServerStatus): string {
  if (s.ok) return `✅ السيرفر شغّال — قاعدة البيانات متّصلة (${s.ms} ms)`;
  if (s.api === "unhealthy") return "⚠️ السيرفر شغّال لكن قاعدة البيانات مش متّصلة";
  if (s.httpStatus) return `⚠️ السيرفر ردّ ${s.httpStatus}`;
  return `❌ ${s.error ?? "السيرفر مش رادّ"}`;
}
