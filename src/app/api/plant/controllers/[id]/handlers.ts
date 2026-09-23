/**
 * ============================================================
 *  POST /api/plant/controllers/[id]/test   — Connection probe
 *  GET  /api/plant/controllers/[id]/status — Live plant status
 *  GET  /api/plant/controllers/[id]/ticket[?number=] — Batched weights
 * ============================================================
 *  RBAC: BATCH_CALIBRATE | SYSTEM_SETTINGS | LAB_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  testController,
  readControllerStatus,
  readControllerTicket,
} from "@/lib/services/batch-control.service";

export const dynamic = "force-dynamic";

const READ_PERMS = [
  PERMISSIONS.BATCH_CALIBRATE,
  PERMISSIONS.SYSTEM_SETTINGS,
  PERMISSIONS.LAB_READ,
] as const;

function badId() {
  return errorResponse("INVALID_CONTROLLER_ID", "Controller ID must be a valid UUID", 400);
}

async function guard(req: NextRequest) {
  const auth = await requireAnyPermission(req, [...READ_PERMS]);
  if ("status" in auth) return { error: auth };
  return { auth };
}

export async function testConnectionRoute(
  req: NextRequest,
  params: Promise<{ id: string }>
) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return badId();
  try {
    const res = await testController(g.auth.user.tenantId, id);
    if (!res) return errorResponse("CONTROLLER_NOT_FOUND", "Controller not found", 404);
    return successResponse(res, res.ok ? "Controller reachable" : "Controller unreachable");
  } catch (err) {
    console.error("[POST /api/plant/controllers/:id/test]", err);
    return errorResponse("BATCH_CTRL_ERROR", "Probe failed", 500);
  }
}

export async function statusRoute(
  req: NextRequest,
  params: Promise<{ id: string }>
) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return badId();
  try {
    const status = await readControllerStatus(g.auth.user.tenantId, id);
    if (!status) return errorResponse("CONTROLLER_NOT_FOUND", "Controller not found", 404);
    return successResponse(status, "Live controller status");
  } catch (err) {
    console.error("[GET /api/plant/controllers/:id/status]", err);
    return errorResponse("BATCH_CTRL_ERROR", "Status read failed", 500);
  }
}

export async function ticketRoute(
  req: NextRequest,
  params: Promise<{ id: string }>
) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return badId();
  const ticketNumber = new URL(req.url).searchParams.get("number") ?? undefined;
  try {
    const ticket = await readControllerTicket(g.auth.user.tenantId, id, ticketNumber);
    if (!ticket) return errorResponse("CONTROLLER_NOT_FOUND", "Controller not found", 404);
    return successResponse(ticket, "Batched quantities");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ticket read failed";
    return errorResponse("BATCH_CTRL_ERROR", message, 422);
  }
}
