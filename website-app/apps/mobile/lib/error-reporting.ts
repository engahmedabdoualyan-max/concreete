/**
 * Client-side error reporting.
 *
 * Sends a failure to POST /api/public/client-error so it shows up in the
 * server log (Render keeps those), which is the only place we can look when a
 * customer says the app "does nothing". Reporting is best-effort and must never
 * throw: an error reporter that crashes the app is worse than no reporter.
 */

import { Platform } from "react-native";
import { API_BASE_URL } from "@/types";
import { resolveApiBase } from "./server-url";

const APP_VERSION = "3.1.0";
const FLUSH_INTERVAL = 5000;

/** Reports queued while the device is offline, replayed on the next call. */
let queue: unknown[] = [];
let lastFlush = 0;

function platformName(): "ios" | "android" | "web" | "windows" | "linux" | "macos" {
  if (Platform.OS === "web") return "web";
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "linux";
}

export interface ReportContext {
  screen?: string;
  context?: string[];
  locale?: string;
}

export async function reportError(
  error: unknown,
  extra: ReportContext = {}
): Promise<void> {
  try {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown error");
    const stack = error instanceof Error ? (error.stack ?? undefined) : undefined;

    queue.push({
      message: message.slice(0, 500),
      stack: stack?.slice(0, 4000),
      appVersion: APP_VERSION,
      platform: platformName(),
      locale: extra.locale,
      screen: extra.screen,
      context: extra.context?.slice(0, 10),
    });

    const now = Date.now();
    if (queue.length === 1 && now - lastFlush > FLUSH_INTERVAL) {
      lastFlush = now;
    }
    if (now - lastFlush < FLUSH_INTERVAL && queue.length < 2) return;

    lastFlush = now;
    const batch = queue;
    queue = [];
    await fetch(`${resolveApiBase(API_BASE_URL)}/api/public/client-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch[0]),
      keepalive: true,
    }).catch(() => {
      // Offline: put it back so the next attempt tries again.
      queue = [...batch, ...queue].slice(0, 5);
    });
  } catch {
    /* reporting must never break the app */
  }
}

/** Flush whatever is queued (call when the app comes back to the foreground). */
export async function flushErrorReports(): Promise<void> {
  try {
    if (!queue.length) return;
    const pending = queue;
    queue = [];
    lastFlush = Date.now();
    await fetch(`${resolveApiBase(API_BASE_URL)}/api/public/client-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending[0]),
      keepalive: true,
    }).catch(() => {
      queue = [...pending, ...queue].slice(0, 5);
    });
  } catch {
    /* ignore */
  }
}
