import { NextRequest, NextResponse } from "next/server";
import { requireAuth, successResponse } from "@/lib/auth/middleware";

export const dynamic = "force-dynamic";

/** Return the server-validated identity for the current access token. */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  return successResponse({ user: auth.user });
}
