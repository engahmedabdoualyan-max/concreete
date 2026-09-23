/**
 * ============================================================
 *  GET /api/auth/sso/login?tenant=CODE&provider=id
 *  → { redirectUrl } — start OIDC login at the IdP (public)
 * ============================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { ssoLoginStart } from "@/lib/services/sso.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenant = url.searchParams.get("tenant");
  const provider = url.searchParams.get("provider");
  if (!tenant || !provider) {
    return NextResponse.json(
      { success: false, errorCode: "INVALID_SSO_QUERY", message: "tenant and provider are required" },
      { status: 400 }
    );
  }

  try {
    const { redirectUrl } = await ssoLoginStart(tenant, provider);
    return NextResponse.json({
      success: true,
      message: "OK",
      data: { redirectUrl },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SSO start failed";
    return NextResponse.json(
      { success: false, errorCode: "SSO_START_FAILED", message },
      { status: 400 }
    );
  }
}
