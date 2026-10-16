/**
 * ============================================================
 *  POST /api/reports/publish — publish a report PDF for WhatsApp
 * ============================================================
 *  The client renders the PDF, uploads base64 here, and gets back a
 *  public no-login URL (same trust model as portal magic links).
 *  One row per (tenant, kind, ref) — re-sharing overwrites.
 *  Guards: authenticated tenant user + per-IP rate limit (10/min).
 * ============================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { reportFiles } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { assertTenantId } from "@/lib/tenant";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { sql } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ShareSchema = z.object({
  kind: z.enum(["lab", "delivery"]),
  ref: z.string().min(3).max(80),
  fileName: z.string().min(3).max(160),
  /** data: URL or raw base64, max ~7MB encoded (≈5MB PDF) */
  pdfBase64: z.string().min(1000).max(9_500_000),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const ip = clientIpFromHeaders(req.headers);
  const rl = checkNextRateLimit(`reports-share:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return errorResponse("RATE_LIMITED", `Too many requests. Retry in ${rl.retryAfterSeconds}s.`, 429);
  }

  let tenantId: string;
  try {
    tenantId = assertTenantId(auth.user.tenantId);
  } catch {
    return errorResponse("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
  const parsed = ShareSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request.", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;
  const clean = d.pdfBase64.includes(",") ? (d.pdfBase64.split(",").pop() as string) : d.pdfBase64;
  if (!/^[A-Za-z0-9+/=]+$/.test(clean)) {
    return errorResponse("VALIDATION_ERROR", "pdfBase64 must be base64 data.", 400);
  }

  const token = randomBytes(24).toString("base64url");
  const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  await db.execute(sql`
    INSERT INTO report_files (tenant_id, kind, ref, file_name, pdf_base64, token, expires_at)
    VALUES (${tenantId}, ${d.kind}, ${d.ref}, ${d.fileName}, ${clean}, ${token}, ${expires.toISOString()})
    ON CONFLICT (tenant_id, kind, ref)
    DO UPDATE SET file_name = EXCLUDED.file_name, pdf_base64 = EXCLUDED.pdf_base64,
      token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, view_count = 0
  `);

  return successResponse({ token, expiresAt: expires.toISOString() }, "Report published.");
}
