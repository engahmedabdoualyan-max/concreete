/**
 * ============================================================
 *  GET /api/public/reports/[token] — serve a shared report PDF
 * ============================================================
 *  No login required (unguessable token + 90-day expiry, same trust
 *  model as the customer portal magic links). Rate-limited per IP.
 * ============================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!token || token.length < 10 || token.length > 64) {
    return NextResponse.json({ success: false, errorCode: "NOT_FOUND" }, { status: 404 });
  }

  const ip = clientIpFromHeaders(req.headers);
  const rl = checkNextRateLimit(`public-report:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ success: false, errorCode: "RATE_LIMITED" }, { status: 429 });
  }

  const rows = await db.execute(sql`
    UPDATE report_files SET view_count = view_count + 1
    WHERE token = ${token} AND expires_at > now()
    RETURNING file_name, pdf_base64
  `);
  const row = (rows.rows as Array<{ file_name: string; pdf_base64: string }>)[0];
  if (!row) {
    return NextResponse.json({ success: false, errorCode: "NOT_FOUND" }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(row.pdf_base64, "base64");
  } catch {
    return NextResponse.json({ success: false, errorCode: "NOT_FOUND" }, { status: 404 });
  }
  const safeName = row.file_name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "report.pdf";
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
