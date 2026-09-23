/** GET /api/plant/controllers/[id]/ticket[?number=] — Batched weights. */
import { NextRequest } from "next/server";
import { ticketRoute } from "../handlers";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return ticketRoute(req, params);
}
