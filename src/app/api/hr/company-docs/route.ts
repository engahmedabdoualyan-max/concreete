import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrCompanyDocs } from "@/db/schema";
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
 *  GET /api/hr/company-docs — the company papers vault
 *  POST /api/hr/company-docs — file one with a name (HR_WRITE)
 *  DELETE /api/hr/company-docs/[id] — remove one (HR_WRITE)
 * ============================================================
 *  Each paper carries an optional expiryDate so the renewals watch can
 *  flag commercial registrations and tax certificates 60 days ahead —
 *  the same rule as iqamas. Bytes travel as data URIs (8 MB cap).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const rows = await db
    .select()
    .from(hrCompanyDocs)
    .where(eq(hrCompanyDocs.tenantId, auth.user.tenantId))
    .orderBy(desc(hrCompanyDocs.createdAt));
  return successResponse({ documents: rows }, `${rows.length} document(s)`);
}

const DocSchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(["COMMERCIAL_REG", "TAX", "EMPLOYEE_FILE", "LICENSE", "OTHER"]),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(100).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  expiryDate: z.string().min(1).optional(),
  storageUrl: z.string().min(1).max(4000).optional(),
  fileData: z.string().min(1).max(11_000_000).optional(),
}).refine((d) => d.storageUrl || d.fileData, { message: "storageUrl or fileData required" });

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = DocSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid document payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const url =
      parsed.data.storageUrl ??
      (parsed.data.mimeType && parsed.data.fileData?.startsWith("data:")
        ? parsed.data.fileData
        : `data:${parsed.data.mimeType ?? "application/octet-stream"};base64,${parsed.data.fileData}`);
    const [created] = await db
      .insert(hrCompanyDocs)
      .values({
        tenantId: auth.user.tenantId,
        title: parsed.data.title,
        kind: parsed.data.kind,
        fileName: parsed.data.fileName,
        mimeType: parsed.data.mimeType ?? null,
        sizeBytes: parsed.data.sizeBytes ?? null,
        storageUrl: url,
        expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
        uploadedById: auth.user.sub,
      })
      .returning();
    return successResponse(created, "تم حفظ الورقة", 201);
  } catch (err) {
    console.error("[POST /api/hr/company-docs]", err);
    return errorResponse("HR_ERROR", "Failed to save document", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !UUID_RE.test(id)) {
    return errorResponse("INVALID_ID", "Invalid document id", 400);
  }
  const [deleted] = await db
    .delete(hrCompanyDocs)
    .where(and(eq(hrCompanyDocs.id, id), eq(hrCompanyDocs.tenantId, auth.user.tenantId)))
    .returning({ id: hrCompanyDocs.id });
  if (!deleted) return errorResponse("DOC_NOT_FOUND", "Document not found", 404);
  return successResponse({ id: deleted.id }, "تم حذف الورقة");
}
