import { NextRequest, NextResponse } from "next/server";
import { reportCache } from "@/services/report-service";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(reportId)) {
    return NextResponse.json({ success: false, errorCode: "REPORT_NOT_FOUND" }, { status: 404 });
  }
  const rl = checkNextRateLimit(`report-share:${clientIpFromHeaders(_req.headers)}`, 30);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, errorCode: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }
  const item = reportCache.get(reportId);
  if (!item || item.expiresAt < Date.now()) {
    return NextResponse.json({ success: false, errorCode: "REPORT_EXPIRED" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(item.buffer), {
    headers: {
      "Content-Type": item.mimeType,
      "Content-Disposition": `inline; filename="${item.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
