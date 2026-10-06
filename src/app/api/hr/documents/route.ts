import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrDocuments } from "@/db/schema";
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
 *  GET /api/hr/documents?employeeId= — file registry of an employee
 *  POST /api/hr/documents — register one (HR_WRITE)
 * ============================================================
 *  Bytes live in object storage; this table holds the reference.
 *  Until a storage bucket is configured, the UI offers the registry
 *  (kinds, names) and marks byte-upload as pending instead of faking it.
 *  Kinds: IQAMA | DRIVING_LICENCE | INSURANCE | CONTRACT | CUSTODY | OTHER.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const employeeId = new URL(req.url).searchParams.get("employeeId");
  if (!employeeId || !UUID_RE.test(employeeId)) {
    return errorResponse("INVALID_ID", "employeeId is required", 400);
  }
  const custodyId = new URL(req.url).searchParams.get("custodyId");
  const rows = await db
    .select()
    .from(hrDocuments)
    .where(
      and(
        eq(hrDocuments.tenantId, auth.user.tenantId),
        eq(hrDocuments.employeeId, employeeId),
        ...(custodyId && UUID_RE.test(custodyId) ? [eq(hrDocuments.custodyId, custodyId)] : [])
      )
    )
    .orderBy(desc(hrDocuments.createdAt));
  return successResponse({ documents: rows }, `${rows.length} document(s)`);
}

const DocSchema = z.object({
  employeeId: z.string().uuid(),
  kind: z.enum(["IQAMA", "DRIVING_LICENCE", "INSURANCE", "CONTRACT", "CUSTODY", "INVESTIGATION", "OTHER"]),
  title: z.string().max(200).optional(),
  custodyId: z.string().uuid().optional(),
  investigationId: z.string().uuid().optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(100).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  // Either a hosted URL (object storage, when configured) or inline base64
  // bytes ("data:<mime>;base64,…", max ~8 MB — enough for employee papers).
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
      .insert(hrDocuments)
      .values({
        tenantId: auth.user.tenantId,
        employeeId: parsed.data.employeeId,
        custodyId: parsed.data.custodyId ?? null,
        investigationId: parsed.data.investigationId ?? null,
        kind: parsed.data.kind,
        title: parsed.data.title?.trim() || null,
        fileName: parsed.data.fileName,
        mimeType: parsed.data.mimeType ?? null,
        sizeBytes: parsed.data.sizeBytes ?? null,
        storageUrl: url,
        uploadedById: auth.user.sub,
      })
      .returning();
    return successResponse(created, "تم تسجيل المستند", 201);
  } catch (err) {
    console.error("[POST /api/hr/documents]", err);
    return errorResponse("HR_ERROR", "Failed to register document", 500);
  }
}
