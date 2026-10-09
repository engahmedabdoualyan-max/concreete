import { NextRequest } from "next/server";
import { db } from "@/db";
import { formRecords } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requireAuth,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";

export const dynamic = "force-dynamic";

/** PUT /api/forms/[id] — edit a saved form · DELETE — remove it. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PutSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  formDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  docs: z.array(z.object({ name: z.string().min(1).max(255), url: z.string().min(1).max(11_000_000) })).max(5).optional(),
  status: z.enum(["DRAFT", "SUBMITTED"]).optional(),
});

async function own(tenantId: string, id: string) {
  if (!UUID_RE.test(id)) return null;
  const [r] = await db
    .select()
    .from(formRecords)
    .where(and(eq(formRecords.id, id), eq(formRecords.tenantId, tenantId)))
    .limit(1);
  return r ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;
  const row = await own(auth.user.tenantId, (await params).id);
  if (!row) return errorResponse("NOT_FOUND", "غير موجود", 404);
  return successResponse(row, "OK");
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;
  const { id } = await params;
  if (!(await own(auth.user.tenantId, id))) return errorResponse("NOT_FOUND", "غير موجود", 404);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid payload", 400);
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.title !== undefined) patch.title = d.title;
  if (d.formDate !== undefined) patch.formDate = d.formDate;
  if (d.data !== undefined) patch.data = d.data;
  if (d.docs !== undefined) patch.docs = d.docs;
  if (d.status !== undefined) patch.status = d.status;
  if (!Object.keys(patch).length) return errorResponse("VALIDATION_ERROR", "لا شيء للتحديث", 400);
  await db.update(formRecords).set(patch).where(eq(formRecords.id, id));
  return successResponse({ id }, "تم الحفظ");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;
  const { id } = await params;
  if (!(await own(auth.user.tenantId, id))) return errorResponse("NOT_FOUND", "غير موجود", 404);
  await db.delete(formRecords).where(eq(formRecords.id, id));
  return successResponse({ id }, "تم الحذف");
}
