import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrExpenseClaims } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  GET /api/hr/expenses[?status=] — out-of-pocket claims
 *  POST /api/hr/expenses — file one (HR_READ; anyone files their own)
 *  PUT /api/hr/expenses?id=&decision= — APPROVED|REJECTED|PAID (HR_WRITE)
 * ============================================================
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const status = new URL(req.url).searchParams.get("status");
  const rows = await db
    .select()
    .from(hrExpenseClaims)
    .where(eq(hrExpenseClaims.tenantId, auth.user.tenantId))
    .orderBy(desc(hrExpenseClaims.createdAt));
  const list =
    status === "PENDING" || status === "APPROVED" || status === "REJECTED" || status === "PAID"
      ? rows.filter((r) => r.status === status)
      : rows;
  return successResponse({ claims: list }, `${list.length} claim(s)`);
}

const ClaimSchema = z.object({
  employeeId: z.string().uuid(),
  kind: z.enum(["FUEL", "TOLL", "PARTS", "OTHER"]).optional(),
  amountSar: z.number().positive(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid claim payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;
  const [created] = await db
    .insert(hrExpenseClaims)
    .values({
      tenantId: auth.user.tenantId,
      employeeId: d.employeeId,
      kind: d.kind ?? "OTHER",
      amountSar: String(d.amountSar),
      expenseDate: d.expenseDate,
      notes: d.notes ?? null,
    })
    .returning();
  return successResponse(created, "تم تقديم المطالبة", 201);
}

const ReviewSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED", "PAID"]) });

export async function PUT(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const decision = url.searchParams.get("decision") ?? "";
  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid claim id", 400);
  const parsed = ReviewSchema.safeParse({ decision });
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "decision must be APPROVED|REJECTED|PAID", 400);

  // PAID only follows APPROVED; APPROVED/REJECTED only leave PENDING.
  const allowedFrom = parsed.data.decision === "PAID" ? ["APPROVED"] : ["PENDING"];
  const [updated] = await db
    .update(hrExpenseClaims)
    .set({ status: parsed.data.decision, reviewedById: auth.user.sub })
    .where(
      and(
        eq(hrExpenseClaims.id, id),
        eq(hrExpenseClaims.tenantId, auth.user.tenantId),
        ...(allowedFrom.length === 1
          ? [eq(hrExpenseClaims.status, allowedFrom[0])]
          : [])
      )
    )
    .returning();
  if (!updated) return errorResponse("CLAIM_NOT_FOUND", "Claim cannot transition like that", 409);
  return successResponse(updated, `Claim ${updated.status}`);
}
