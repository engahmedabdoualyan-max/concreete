import { NextRequest } from "next/server";
import { approve } from "../../actions";

export const dynamic = "force-dynamic";

/** POST /api/procure/requests/[id]/approve */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return approve(req, { params });
}
