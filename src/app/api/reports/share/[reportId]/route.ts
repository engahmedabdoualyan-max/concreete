import { NextRequest, NextResponse } from "next/server";
import { reportCache } from "@/services/report-service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const item = reportCache.get(reportId);
  if (!item || item.expiresAt < Date.now()) {
    return NextResponse.json({ success: false, errorCode: "REPORT_EXPIRED" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(item.buffer), {
    headers: {
      "Content-Type": item.mimeType,
      "Content-Disposition": `inline; filename="${item.filename}"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
