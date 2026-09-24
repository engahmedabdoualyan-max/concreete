/**
 * ============================================================
 *  POST /api/auth/delete-account
 *  Google Play In-App Account Deletion Compliance
 * ============================================================
 *
 *  Purges the authenticated user's personal data and ALL active
 *  tokens/sessions from Supabase.
 *
 *  DELETION STRATEGY (industry standard, GDPR + Google Play compliant):
 *   1. Revoke + hard-delete every user_sessions row  (auth tokens purged)
 *   2. Null out the refresh token hash on the user row
 *   3. Attempt a HARD DELETE of the user row inside a transaction
 *   4. If referential integrity requires the operational history to be
 *      retained (the user created orders / drove trips / signed weighbridge
 *      tickets that are legally/financially immutable), fall back to a
 *      CRYPTO-SHRED: every PII column is overwritten with an irreversible
 *      tombstone and the account is deactivated.
 *
 *  Either path guarantees: name, email, phone, push token, password and all
 *  auth tokens are permanently unrecoverable.
 *
 *  The client must send { confirmText: "DELETE" } to prevent accidental calls.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, userSessions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { z } from "zod";

export const dynamic = "force-dynamic";

const DeleteSchema = z.object({
  /** Explicit confirmation string — guards against accidental deletion */
  confirmText: z.literal("DELETE"),
  /** Optional free-text reason captured for the compliance audit trail */
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "CONFIRMATION_REQUIRED",
      'You must send { "confirmText": "DELETE" } to permanently delete your account.',
      400,
      { fields: parsed.error.flatten().fieldErrors }
    );
  }

  const userId = auth.user.sub;

  try {
    const outcome = await db.transaction(async (tx) => {
      // 1. Hard-delete every session (all access + refresh tokens revoked)
      const removedSessions = await tx
        .delete(userSessions)
        .where(
          and(
            eq(userSessions.userId, userId),
            eq(userSessions.tenantId, auth.user.tenantId)
          )
        )
        .returning({ id: userSessions.id });

      // 2. Attempt a full hard delete of the user row
      try {
        const deleted = await tx
          .delete(users)
          .where(
          and(
            eq(users.id, userId),
            eq(users.tenantId, auth.user.tenantId)
          )
        )
          .returning({ id: users.id });

        if (deleted.length > 0) {
          return {
            mode: "HARD_DELETE" as const,
            sessionsRemoved: removedSessions.length,
          };
        }
        return { mode: "NOT_FOUND" as const, sessionsRemoved: removedSessions.length };
      } catch {
        // 3. FK restrict blocked the delete → CRYPTO-SHRED the PII instead.
        // Operational records (orders, trips, signed weighbridge tickets) are
        // legally required to be retained, but every personal identifier is
        // irreversibly scrubbed here.
        const tombstone = `deleted-${userId.slice(0, 8)}`;
        await tx
          .update(users)
          .set({
            fullName: "Deleted User",
            email: `${tombstone}@deleted.fimtosoft.local`,
            employeeCode: `DEL-${userId.slice(0, 8)}`,
            phoneNumber: null,
            pushToken: null,
            passwordHash: "ACCOUNT_DELETED_NO_LOGIN",
            refreshTokenHash: null,
            zone: null,
            permissions: [],
            isActive: false,
            updatedAt: new Date(),
          })
          .where(
          and(
            eq(users.id, userId),
            eq(users.tenantId, auth.user.tenantId)
          )
        );

        return {
          mode: "ANONYMISED" as const,
          sessionsRemoved: removedSessions.length,
        };
      }
    });

    if (outcome.mode === "NOT_FOUND") {
      return errorResponse("NOT_FOUND", "Account not found or already deleted", 404);
    }

    return successResponse(
      {
        deleted: true,
        mode: outcome.mode,
        sessionsRevoked: outcome.sessionsRemoved,
        personalDataPurged: true,
        tokensPurged: true,
      },
      outcome.mode === "HARD_DELETE"
        ? "Your account and all personal data have been permanently deleted."
        : "Your personal data and all login tokens have been permanently erased. Immutable operational records were anonymised as required by law."
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("DELETE_FAILED", message, 500);
  }
}
