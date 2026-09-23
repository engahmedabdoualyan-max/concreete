/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Push Notification Service — Expo Push (Epic 12)
 * ============================================================
 *
 *  Dependency-free delivery via the Expo Push API:
 *    POST https://exp.host/--/api/v2/push/send
 *    { to, title, body, data }
 *
 *  The mobile app registers its ExponentPushToken via
 *  POST /api/push/register (stored on users.push_token).
 *  Every send is best-effort and NEVER throws — failures are
 *  logged to audit_logs and reported in the result.
 * ============================================================
 */

import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export interface PushMessage {
  toUserId?: string;
  toToken?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  sent: boolean;
  provider: "expo-push";
  ticketId?: string;
  error?: string;
}

async function sendToToken(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ ok: boolean; ticketId?: string; error?: string }> {
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data: data ?? {},
        sound: "default",
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      data?: { status?: string; id?: string; message?: string };
    };
    if (payload.data?.status === "ok") {
      return { ok: true, ticketId: payload.data.id };
    }
    // Expo returns 200 with per-message errors ("DeviceNotRegistered" etc.)
    return { ok: false, error: payload.data?.message ?? `Expo HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Push failed" };
  }
}

async function auditPush(
  tenantId: string,
  userId: string | null,
  title: string,
  sent: boolean,
  error?: string
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: "PUSH_SENT",
      entityType: "push",
      entityId: null,
      newState: { title, sent, error: error ?? null },
    });
  } catch {
    // Audit failure must never cascade
  }
}

async function tokenForUser(tenantId: string, userId: string): Promise<string | null> {
  const rows = await db
    .select({ pushToken: users.pushToken })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);
  const token = rows[0]?.pushToken;
  return token && token.startsWith("ExponentPushToken[") ? token : null;
}

/**
 * Sends a push notification. Resolves a userId to their registered
 * Expo token, or sends directly to a raw token. NEVER throws.
 */
export async function sendPush(
  tenantId: string,
  msg: PushMessage
): Promise<PushResult> {
  let token = msg.toToken ?? null;
  if (!token && msg.toUserId) {
    token = await tokenForUser(tenantId, msg.toUserId);
  }
  if (!token) {
    await auditPush(tenantId, msg.toUserId ?? null, msg.title, false, "NO_PUSH_TOKEN");
    return { sent: false, provider: "expo-push", error: "NO_PUSH_TOKEN" };
  }

  const res = await sendToToken(token, msg.title, msg.body, msg.data);

  // Drop dead tokens so future sends stay clean
  if (!res.ok && res.error === "DeviceNotRegistered" && msg.toUserId) {
    try {
      await db
        .update(users)
        .set({ pushToken: null })
        .where(and(eq(users.id, msg.toUserId), eq(users.tenantId, tenantId)));
    } catch {
      // ignore
    }
  }

  await auditPush(tenantId, msg.toUserId ?? null, msg.title, res.ok, res.error);
  return { sent: res.ok, provider: "expo-push", ticketId: res.ticketId, error: res.error };
}

/** Fan-out to every user holding one of the given roles. */
export async function sendPushToRoles(
  tenantId: string,
  roles: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ sent: number; failed: number }> {
  const rows = await db
    .select({ id: users.id, pushToken: users.pushToken })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true),
        inArray(users.role, roles as never[])
      )
    );
  let sent = 0;
  let failed = 0;
  for (const u of rows) {
    if (!u.pushToken?.startsWith("ExponentPushToken[")) {
      failed++;
      continue;
    }
    const res = await sendToToken(u.pushToken, title, body, data);
    if (res.ok) sent++;
    else failed++;
  }
  await auditPush(tenantId, null, `${title} → roles [${roles.join(",")}]`, true);
  return { sent, failed };
}

/** Stores / replaces the caller's Expo push token (called by the mobile app). */
export async function registerPushToken(
  tenantId: string,
  userId: string,
  token: string
): Promise<boolean> {
  if (!token.startsWith("ExponentPushToken[")) return false;
  await db
    .update(users)
    .set({ pushToken: token.slice(0, 255) })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
  return true;
}
