/**
 * Enterprise inbound integration endpoint secured by API keys.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { verifyEnterpriseApiKey, pushSignedOperationalEvent } from "@/services/report-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key") ?? "";
  const principal = await verifyEnterpriseApiKey(apiKey);
  if (!principal) return errorResponse("INVALID_API_KEY", "Invalid or missing enterprise API key", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be JSON", 400);
  }
  const payload = body as { entity: string; rows: Record<string, unknown>[]; source?: string };
  if (!payload.entity || !Array.isArray(payload.rows)) {
    return errorResponse("VALIDATION_ERROR", "entity and rows[] are required", 400);
  }

  await db.execute(sql`
    INSERT INTO audit_logs (id, tenant_id, action, entity_type, new_state, created_at)
    VALUES (gen_random_uuid(), ${principal.tenantId}, 'EXTERNAL_SYNC_RECEIVED', ${payload.entity}, ${JSON.stringify(payload)}::jsonb, now())
  `);

  const signed = await pushSignedOperationalEvent("EXTERNAL_SYNC_RECEIVED", principal.tenantId, {
    source: payload.source ?? "external",
    entity: payload.entity,
    rowCount: payload.rows.length,
  });

  return successResponse({
    accepted: true,
    tenantId: principal.tenantId,
    entity: payload.entity,
    rowCount: payload.rows.length,
    signedOutboundEvent: signed,
  });
}
