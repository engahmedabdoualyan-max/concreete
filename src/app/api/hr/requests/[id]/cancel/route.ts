/** POST /api/hr/requests/[id]/cancel — Withdraw own request. */
import { NextRequest } from "next/server";
import { cancelRoute } from "../handlers";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return cancelRoute(req, params);
}
