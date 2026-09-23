/**
 * ============================================================
 *  POST /api/v1/tree-sync/orders — Tree → PG order import
 * ============================================================
 *
 *  Field-speed plane pushes Firestore tree orders into the ERP
 *  system of record (upsert by tree doc id). Missing clients /
 *  sites / mixes are auto-created and reported. Money safety:
 *  tree "approved" lands at PENDING_FINANCE; price is always
 *  set inside the ERP (RFQ/finance), never trusted from import.
 *
 *  AUTH: X-Integration-Key (TREE_SYNC_KEY) + rate limit.
 *  Accepts single object or { orders: [...] } (max 200).
 * ============================================================
 */

import { NextRequest } from "next/server";
import crypto from "crypto";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { importTreeOrder, type TreeOrderPayload } from "@/lib/services/tree-sync.service";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SYNC_KEY =
  process.env.TREE_SYNC_KEY ?? "fimto-tree-sync-dev-key-change-me";

function keyMatches(provided: string | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(SYNC_KEY);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const TreeOrderSchema = z.object({
  ref: z.string().min(1).max(80),
  orderNo: z.string().max(30).optional(),
  customerName: z.string().min(1).max(200),
  customerPhone: z.string().max(20).optional(),
  projectName: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  elementType: z.string().max(60).optional(),
  orderType: z.string().max(20).optional(),
  quantity: z.number().nonnegative().max(100000).optional(),
  mixCode: z.string().max(30).optional(),
  status: z.string().max(20).optional(),
  scheduledDate: z.string().min(1).optional(),
  salesRepEmail: z.string().max(200).optional(),
});

const PayloadSchema = z.union([
  TreeOrderSchema,
  z.object({
    tenantCode: z.string().min(1).max(40).optional(),
    orders: z.array(TreeOrderSchema).min(1).max(200),
  }),
]);

export async function POST(req: NextRequest) {
  const ip = clientIpFromHeaders(req.headers);
  const rl = checkNextRateLimit(`tree-sync:${ip}`);
  if (!rl.allowed) {
    return errorResponse(
      "RATE_LIMITED",
      `Too many requests. Retry in ${rl.retryAfterSeconds}s.`,
      429
    );
  }

  if (!keyMatches(req.headers.get("x-integration-key"))) {
    return errorResponse("INVALID_INTEGRATION_KEY", "Missing or invalid X-Integration-Key", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid tree order payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Resolve tenant: explicit code wins, else single-tenant fallback
  let tenantId: string | null = null;
  const data = parsed.data as
    | TreeOrderPayload
    | { tenantCode?: string; orders: TreeOrderPayload[] };
  const code = (data as { tenantCode?: string }).tenantCode;
  if (code) {
    const t = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.tenantCode, code))
      .limit(1);
    if (!t[0]) return errorResponse("UNKNOWN_TENANT", "tenantCode not found", 404);
    tenantId = t[0].id;
  } else {
    const all = await db.select({ id: tenants.id }).from(tenants).limit(2);
    if (all.length !== 1) {
      return errorResponse(
        "TENANT_REQUIRED",
        "Multiple tenants — include tenantCode in the payload",
        400
      );
    }
    tenantId = all[0].id;
  }

  const list: TreeOrderPayload[] = Array.isArray(
    (data as { orders?: unknown }).orders
  )
    ? (data as { orders: TreeOrderPayload[] }).orders
    : [data as TreeOrderPayload];

  const results: ({ ok: true; ref: string; orderId: string; orderNumber: string; created: boolean; autoCreated: string[] } | { ok: false; ref: string; error: string })[] = [];
  for (const item of list) {
    try {
      const r = await importTreeOrder(tenantId, item);
      results.push({
        ok: true,
        ref: item.ref,
        orderId: r.orderId,
        orderNumber: r.orderNumber,
        created: r.created,
        autoCreated: r.autoCreated,
      });
    } catch (err) {
      results.push({
        ok: false,
        ref: item.ref ?? "?",
        error: err instanceof Error ? err.message : "Import failed",
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return successResponse(
    { results, imported: okCount, total: results.length },
    `${okCount}/${results.length} order(s) synced`
  );
}
