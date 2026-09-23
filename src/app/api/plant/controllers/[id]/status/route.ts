/** GET /api/plant/controllers/[id]/status — Live plant status. */
import { NextRequest } from "next/server";
import { statusRoute } from "../handlers";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return statusRoute(req, params);
}
