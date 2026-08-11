/** Multi-tenant report export endpoint: PDF/XLSX + WhatsApp share links. */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { generateExcelReport, generatePdfReport } from "@/services/report-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "pdf";
  const download = url.searchParams.get("download") === "1";
  const filters = {
    tenantId: url.searchParams.get("tenantId") ?? auth.user.tenantId,
    from: url.searchParams.get("from") ?? new Date(Date.now() - 30 * 86400_000).toISOString(),
    to: url.searchParams.get("to") ?? new Date().toISOString(),
    vehicleTypes: url.searchParams.getAll("vehicleType"),
    mixDesignIds: url.searchParams.getAll("mixDesignId"),
    driverIds: url.searchParams.getAll("driverId"),
    locale: (url.searchParams.get("locale") ?? "en") as "en" | "ar" | "ur" | "hi",
  };

  try {
    const report =
      format === "xlsx"
        ? await generateExcelReport({ tenantId: auth.user.tenantId, userId: auth.user.sub, role: auth.user.role, permissions: auth.user.permissions }, filters)
        : await generatePdfReport({ tenantId: auth.user.tenantId, userId: auth.user.sub, role: auth.user.role, permissions: auth.user.permissions }, filters);

    if (download) {
      return new NextResponse(new Uint8Array(report.buffer), {
        headers: {
          "Content-Type": report.mimeType,
          "Content-Disposition": `attachment; filename="${report.filename}"`,
        },
      });
    }

    return successResponse({
      reportId: report.reportId,
      tenantId: report.tenantId,
      mimeType: report.mimeType,
      filename: report.filename,
      shareUrl: report.shareUrl,
      whatsappUrl: report.whatsappUrl,
    });
  } catch (err) {
    return errorResponse("REPORT_ERROR", err instanceof Error ? err.message : "Unknown error", 500);
  }
}
