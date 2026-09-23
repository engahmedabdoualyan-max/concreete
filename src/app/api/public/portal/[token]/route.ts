/**
 * ============================================================
 *  GET /api/public/portal/[token] — PUBLIC customer portal data
 * ============================================================
 *  NO AUTHENTICATION — the magic token IS the credential.
 *  Only public-safe fields are returned (no costs, no staff names).
 *  Expired / revoked / unknown tokens → 404 (identical response,
 *  so attackers cannot probe which tokens exist).
 * ============================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { resolvePortalToken } from "@/lib/services/portal.service";

export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json(
    {
      success: false,
      errorCode: "PORTAL_NOT_FOUND",
      message: "This tracking link is invalid or has expired. Please ask your supplier for a new link.",
      timestamp: new Date().toISOString(),
    },
    { status: 404 }
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 10 || token.length > 64) return notFound();

  try {
    const portal = await resolvePortalToken(token);
    if (!portal) return notFound();
    return NextResponse.json({
      success: true,
      message: "OK",
      data: portal,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[GET /api/public/portal/:token]", err);
    return notFound();
  }
}
