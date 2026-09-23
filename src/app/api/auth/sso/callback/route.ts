/**
 * ============================================================
 *  GET /api/auth/sso/callback?code=&state= — OIDC callback (public)
 * ============================================================
 *  Verifies state, exchanges the code, validates the ID token
 *  and issues the standard ERP token pair for an EXISTING user.
 *  SSO_NO_ACCOUNT → 403 (ask your administrator for an account).
 * ============================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { ssoCallback } from "@/lib/services/sso.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json(
      { success: false, errorCode: "SSO_IDP_ERROR", message: `Identity provider: ${error}` },
      { status: 400 }
    );
  }
  if (!code || !state) {
    return NextResponse.json(
      { success: false, errorCode: "INVALID_SSO_CALLBACK", message: "code and state are required" },
      { status: 400 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    const data = await ssoCallback(code, state, ip);
    return NextResponse.json({
      success: true,
      message: "SSO login successful",
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SSO failed";
    const status = message === "SSO_NO_ACCOUNT" || message === "ACCOUNT_DISABLED" ? 403 : 400;
    return NextResponse.json(
      {
        success: false,
        errorCode: message === "SSO_NO_ACCOUNT" ? "SSO_NO_ACCOUNT" : "SSO_FAILED",
        message:
          message === "SSO_NO_ACCOUNT"
            ? "No ERP account for this email — ask your administrator to create one."
            : message,
      },
      { status }
    );
  }
}
