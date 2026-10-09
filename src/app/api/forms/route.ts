import { NextRequest } from "next/server";
import { db } from "@/db";
import { formRecords } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requireAuth,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  Forms library records (مكتبة النماذج) — any logged-in employee
 *  GET    /api/forms?code=MT-OP-01 — saved filled forms
 *  POST   /api/forms — save a filled form (+ optional docs)
 *  PUT    /api/forms/[id] — edit fields/status/docs
 *  DELETE /api/forms/[id] — delete
 * ============================================================
 *  Tenant-scoped, audit-stamped. Layouts live in the frontend catalog;
 *  the server stores filled data + doc data-URIs (8 MB each, max 5).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;
  const code = new URL(req.url).searchParams.get("code");
  const conds = [eq(formRecords.tenantId, auth.user.tenantId)];
  if (code) conds.push(eq(formRecords.formCode, code));
  const rows = await db
    .select({
      id: formRecords.id,
      formCode: formRecords.formCode,
      title: formRecords.title,
      formDate: formRecords.formDate,
      status: formRecords.status,
      createdAt: formRecords.createdAt,
    })
    .from(formRecords)
    .where(and(...conds))
    .orderBy(desc(formRecords.createdAt))
    .limit(200);
  return successResponse({ records: rows }, `${rows.length} record(s)`);
}

const DocSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().min(1).max(11_000_000),
});

const SaveSchema = z.object({
  formCode: z.string().trim().min(3).max(20),
  title: z.string().trim().min(2).max(200),
  formDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  docs: z.array(DocSchema).max(5).optional(),
  status: z.enum(["DRAFT", "SUBMITTED"]).optional(),
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
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid form payload", 400);
  const d = parsed.data;
  const [row] = await db
    .insert(formRecords)
    .values({
      tenantId: auth.user.tenantId,
      formCode: d.formCode,
      title: d.title,
      formDate: d.formDate ?? null,
      data: d.data ?? {},
      docs: d.docs ?? [],
      status: d.status ?? "DRAFT",
      createdById: auth.user.sub,
    })
    .returning({ id: formRecords.id });
  return successResponse({ id: row.id }, "تم حفظ النموذج", 201);
}
