/**
 * ============================================================
 *  GET  /api/integrations/accounting  — List connections (no secrets)
 *  POST /api/integrations/accounting  — Register a connection
 * ============================================================
 *  RBAC: FINANCE_READ (GET) · FINANCE_INVOICE_MANAGE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listConnections, createConnection } from "@/lib/services/accounting-sync.service";
import { ACCOUNTING_PROVIDERS } from "@/lib/integrations/accounting/connector";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  try {
    const connections = await listConnections(auth.user.tenantId);
    return successResponse(
      { connections, providers: ACCOUNTING_PROVIDERS },
      `${connections.length} connection(s)`
    );
  } catch (err) {
    console.error("[GET /api/integrations/accounting]", err);
    return errorResponse("INTEGRATION_ERROR", "Failed to list connections", 500);
  }
}

const CreateConnectionSchema = z.object({
  provider: z.enum(["ZOHO_BOOKS", "QUICKBOOKS", "CSV_BRIDGE"]),
  name: z.string().min(1).max(120),
  credentials: z.record(z.string(), z.string()).default({}),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_INVOICE_MANAGE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid connection payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const created = await createConnection(
      auth.user.tenantId,
      auth.user.sub,
      {
        provider: parsed.data.provider,
        name: parsed.data.name,
        credentials: parsed.data.credentials,
        settings: parsed.data.settings as Record<string, unknown> | undefined,
      }
    );
    return successResponse(created, "Integration connection registered", 201);
  } catch (err) {
    console.error("[POST /api/integrations/accounting]", err);
    return errorResponse("INTEGRATION_ERROR", "Failed to register connection", 500);
  }
}
