/**
 * GET /api/weighbridge/verify
 * Verifies the complete SHA-256 hash chain for tamper detection.
 * Restricted to SUPER_ADMIN only — this is an audit function.
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/middleware";
import { successResponse, errorResponse } from "@/lib/auth/middleware";
import { verifyWeighbridgeChain } from "@/lib/weighbridge";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["SUPER_ADMIN"]);
  if ("status" in auth) return auth;

  try {
    const result = await verifyWeighbridgeChain(auth.user.tenantId);

    // Log the verification audit entry
    await db.insert(auditLogs).values({
      userId: auth.user.sub,
      tenantId: auth.user.tenantId,
      action: "WEIGHBRIDGE_CHAIN_VERIFIED",
      entityType: "weighbridge_transactions",
      newState: result,
    });

    return successResponse(
      {
        chainVerification: result,
        governanceNote:
          "The Fimto Soft weighbridge ledger uses SHA-256 hash chains. " +
          "Each record's hash is computed from its own data + the previous record hash. " +
          "A single altered weight, timestamp, or tare value will break the chain at that point.",
      },
      result.isValid
        ? `✅ ${result.message}`
        : `🚨 INTEGRITY BREACH DETECTED: ${result.message}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("VERIFICATION_ERROR", message, 500);
  }
}
