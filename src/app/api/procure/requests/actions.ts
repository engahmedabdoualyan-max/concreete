import { NextRequest } from "next/server";
import { db } from "@/db";
import { procureApprovals, procureQuotes, procureRequests } from "@/db/schema";
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
 * Per-request actions. Status machine:
 * DRAFT → SUBMITTED (≥3 quotes) → UNDER_REVIEW → APPROVED → RECEIVED
 * → ISSUED → CLOSED. REJECTED at review or final. Only the listed
 * transition runs from each state — anything else 409s.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function own(tenantId: string, id: string) {
  if (!UUID_RE.test(id)) return null;
  const rows = await db
    .select()
    .from(procureRequests)
    .where(and(eq(procureRequests.id, id), eq(procureRequests.tenantId, tenantId)));
  return rows[0] ?? null;
}

async function setStatus(
  tenantId: string,
  id: string,
  from: string[],
  to: string,
  extra: Record<string, unknown> = {}
) {
  const row = await own(tenantId, id);
  if (!row) return { error: errorResponse("REQUEST_NOT_FOUND", "Request not found", 404) };
  if (!from.includes(row.status)) {
    return {
      error: errorResponse("BAD_TRANSITION", `Cannot move from ${row.status}`, 409),
    };
  }
  const [updated] = await db
    .update(procureRequests)
    .set({ status: to, updatedAt: new Date(), ...extra })
    .where(eq(procureRequests.id, id))
    .returning();
  return { row: updated };
}

const QuoteSchema = z.object({
  supplierName: z.string().min(1).max(200),
  amountSar: z.number().positive(),
  slotNo: z.number().int().min(1).max(3).optional(),
  fileName: z.string().min(1).max(255).optional(),
  mimeType: z.string().max(100).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  storageUrl: z.string().min(1).max(4000).optional(),
  fileData: z.string().min(1).max(11_000_000).optional(),
});

/** POST /[id]/quotes — attach a supplier quote + invoice (PROCURE_REQUEST) */
export async function quotes(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.PROCURE_REQUEST);
  if ("status" in auth) return auth;
  const { id } = await params;
  const row = await own(auth.user.tenantId, id);
  if (!row) return errorResponse("REQUEST_NOT_FOUND", "Request not found", 404);
  if (row.status !== "DRAFT") {
    return errorResponse("BAD_TRANSITION", "Quotes attach while DRAFT", 409);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = QuoteSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid quote payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;
  const url =
    d.storageUrl ??
    (d.fileData
      ? d.mimeType && d.fileData.startsWith("data:")
        ? d.fileData
        : `data:${d.mimeType ?? "application/octet-stream"};base64,${d.fileData}`
      : null);
  // Same slot twice replaces the previous quote (re-upload corrected invoice).
  if (d.slotNo !== undefined) {
    await db
      .delete(procureQuotes)
      .where(
        and(
          eq(procureQuotes.requestId, id),
          eq(procureQuotes.tenantId, auth.user.tenantId),
          eq(procureQuotes.slotNo, d.slotNo)
        )
      );
  }
  const [created] = await db
    .insert(procureQuotes)
    .values({
      tenantId: auth.user.tenantId,
      requestId: id,
      supplierName: d.supplierName.trim(),
      amountSar: String(d.amountSar),
      slotNo: d.slotNo ?? null,
      fileName: d.fileName ?? null,
      mimeType: d.mimeType ?? null,
      sizeBytes: d.sizeBytes ?? null,
      storageUrl: url,
      createdById: auth.user.sub,
    })
    .returning();
  return successResponse(created, "تم إرفاق عرض السعر", 201);
}

/** POST /[id]/submit — needs ≥3 quotes (PROCURE_REQUEST) */
export async function submit(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.PROCURE_REQUEST);
  if ("status" in auth) return auth;
  const { id } = await params;
  const row = await own(auth.user.tenantId, id);
  if (!row) return errorResponse("REQUEST_NOT_FOUND", "Request not found", 404);
  const n = await db
    .select({ slotNo: procureQuotes.slotNo })
    .from(procureQuotes)
    .where(
      and(eq(procureQuotes.requestId, id), eq(procureQuotes.tenantId, auth.user.tenantId))
    );
  const slots = new Set(n.map((q) => q.slotNo));
  if (!(slots.has(1) && slots.has(2) && slots.has(3))) {
    return errorResponse("QUOTES_REQUIRED", "العروض الثلاثة (1 و2 و3) مطلوبة", 409);
  }
  const r = await setStatus(auth.user.tenantId, id, ["DRAFT"], "SUBMITTED");
  if ("error" in r) return r.error;
  return successResponse(r.row, "تم إرسال الطلب للمراجعة");
}

const DecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(2000).optional(),
  quoteId: z.string().uuid().optional(),
  disbursedSar: z.number().nonnegative().optional(),
});

async function decide(
  req: NextRequest,
  params: Promise<{ id: string }>,
  stage: "REVIEW" | "FINAL",
  perm: string,
  from: string[],
  toApprove: string
) {
  const auth = await requirePermission(req, perm as never);
  if ("status" in auth) return auth;
  const { id } = await params;
  const row = await own(auth.user.tenantId, id);
  if (!row) return errorResponse("REQUEST_NOT_FOUND", "Request not found", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid decision payload", 400);
  }
  const d = parsed.data;
  if (d.decision === "REJECTED") {
    const r = await setStatus(auth.user.tenantId, id, from, "REJECTED");
    if ("error" in r) return r.error;
  } else {
    if (stage === "FINAL" && d.quoteId) {
      const q = await db
        .select()
        .from(procureQuotes)
        .where(and(eq(procureQuotes.id, d.quoteId), eq(procureQuotes.requestId, id)));
      if (q.length === 0) return errorResponse("QUOTE_NOT_FOUND", "Chosen quote not on this request", 404);
    }
    const r = await setStatus(auth.user.tenantId, id, from, toApprove, {
      ...(stage === "FINAL"
        ? {
            chosenQuoteId: d.quoteId ?? null,
            disbursedSar: d.disbursedSar !== undefined ? String(d.disbursedSar) : null,
          }
        : {}),
    });
    if ("error" in r) return r.error;
  }
  await db.insert(procureApprovals).values({
    tenantId: auth.user.tenantId,
    requestId: id,
    stage,
    decision: d.decision,
    note: d.note?.trim() || null,
    decidedById: auth.user.sub,
  });
  return successResponse({ decision: d.decision }, d.decision === "APPROVED" ? "تم الاعتماد" : "تم الرفض");
}

/** POST /[id]/review — first approval (PROCURE_REVIEW) */
export async function review(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return decide(req, params, "REVIEW", PERMISSIONS.PROCURE_REVIEW, ["SUBMITTED"], "UNDER_REVIEW");
}

/** POST /[id]/approve — final + disbursement (PROCURE_APPROVE) */
export async function approve(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return decide(req, params, "FINAL", PERMISSIONS.PROCURE_APPROVE, ["UNDER_REVIEW"], "APPROVED");
}

/** POST /[id]/receive — goods in warehouse (WAREHOUSE_WRITE) */
export async function receive(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.WAREHOUSE_WRITE);
  if ("status" in auth) return auth;
  const { id } = await params;
  const r = await setStatus(auth.user.tenantId, id, ["APPROVED"], "RECEIVED");
  if ("error" in r) return r.error;
  return successResponse(r.row, "تم الاستلام بالمخزن — أنشئ صنف المخزن والحركة ثم اطبع QR");
}

/** POST /[id]/issue — issued to workshop (WAREHOUSE_WRITE) */
export async function issue(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.WAREHOUSE_WRITE);
  if ("status" in auth) return auth;
  const { id } = await params;
  const r = await setStatus(auth.user.tenantId, id, ["RECEIVED"], "ISSUED");
  if ("error" in r) return r.error;
  return successResponse(r.row, "تم الصرف للورشة");
}

/** POST /[id]/close — archive (WAREHOUSE_WRITE) */
export async function close(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.WAREHOUSE_WRITE);
  if ("status" in auth) return auth;
  const { id } = await params;
  const r = await setStatus(auth.user.tenantId, id, ["ISSUED"], "CLOSED");
  if ("error" in r) return r.error;
  return successResponse(r.row, "تم إغلاق الطلب");
}

/** GET /[id] — one request with quotes + approvals trail */
export async function detail(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.PROCURE_REQUEST);
  if ("status" in auth) return auth;
  const { id } = await params;
  const row = await own(auth.user.tenantId, id);
  if (!row) return errorResponse("REQUEST_NOT_FOUND", "Request not found", 404);
  const [qs, ap] = await Promise.all([
    db
      .select()
      .from(procureQuotes)
      .where(
        and(eq(procureQuotes.requestId, id), eq(procureQuotes.tenantId, auth.user.tenantId))
      )
      .orderBy(desc(procureQuotes.createdAt)),
    db
      .select()
      .from(procureApprovals)
      .where(
        and(eq(procureApprovals.requestId, id), eq(procureApprovals.tenantId, auth.user.tenantId))
      )
      .orderBy(desc(procureApprovals.createdAt)),
  ]);
  return successResponse({ request: row, quotes: qs, approvals: ap });
}
