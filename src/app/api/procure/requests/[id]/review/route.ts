import { NextRequest } from "next/server";
import { review } from "../../actions";

export const dynamic = "force-dynamic";

/** POST /api/procure/requests/[id]/review */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return review(req, { params });
}
