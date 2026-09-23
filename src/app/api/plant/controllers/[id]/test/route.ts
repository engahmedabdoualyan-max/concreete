/** POST /api/plant/controllers/[id]/test — Connection probe. */
import { NextRequest } from "next/server";
import { testConnectionRoute } from "../handlers";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return testConnectionRoute(req, params);
}
