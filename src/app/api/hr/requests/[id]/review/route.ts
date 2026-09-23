/** POST /api/hr/requests/[id]/review — HR decision. */
import { NextRequest } from "next/server";
import { reviewRoute } from "../handlers";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return reviewRoute(req, params);
}
