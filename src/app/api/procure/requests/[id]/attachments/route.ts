import { NextRequest } from "next/server";
import { db } from "@/db";
import { procureAttachments } from "@/db/schema";
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
 *  GET /api/procure/requests/[id]/attachments — request papers
 *  POST — attach a PDF/image (PROCURE_REQUEST, DRAFT only)
 *  DELETE ?id= — remove one (PROCURE_REQUEST, DRAFT only)
 * ============================================================
 *  Bytes travel as data URIs (8 MB cap), same pattern as HR docs.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.PROCURE_REQUEST);
  if ("status" in auth) return auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid id", 400);
  const rows = await db
    .select()
    .from(procureAttachments)
    .where(
      and(
        eq(procureAttachments.requestId, id),
        eq(procureAttachments.tenantId, auth.user.tenantId)
      )
    )
    .orderBy(desc(procureAttachments.createdAt));
  return successResponse({ attachments: rows }, `${rows.length} file(s)`);
}

const AttachSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(100).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  storageUrl: z.string().min(1).max(4000).optional(),
  fileData: z.string().min(1).max(11_000_000).optional(),
}).refine((d) => d.storageUrl || d.fileData, { message: "storageUrl or fileData required" });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.PROCURE_REQUEST);
  if ("status" in auth) return auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = AttachSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid attachment payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;
  const url =
    d.storageUrl ??
    (d.mimeType && d.fileData?.startsWith("data:")
      ? d.fileData
      : `data:${d.mimeType ?? "application/octet-stream"};base64,${d.fileData}`);
  const [created] = await db
    .insert(procureAttachments)
    .values({
      tenantId: auth.user.tenantId,
      requestId: id,
      fileName: d.fileName,
      mimeType: d.mimeType ?? null,
      sizeBytes: d.sizeBytes ?? null,
      storageUrl: url,
      uploadedById: auth.user.sub,
    })
    .returning();
  return successResponse(created, "تم إرفاق الملف", 201);
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.PROCURE_REQUEST);
  if ("status" in auth) return auth;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid id", 400);
  const [deleted] = await db
    .delete(procureAttachments)
    .where(
      and(
        eq(procureAttachments.id, id),
        eq(procureAttachments.tenantId, auth.user.tenantId)
      )
    )
    .returning({ id: procureAttachments.id });
  if (!deleted) return errorResponse("NOT_FOUND", "Attachment not found", 404);
  return successResponse({ id: deleted.id }, "تم حذف المرفق");
}
