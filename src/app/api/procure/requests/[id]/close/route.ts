import { NextRequest } from "next/server";
import { close } from "../../actions";

export const dynamic = "force-dynamic";

/** POST /api/procure/requests/[id]/close */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return close(req, { params });
}
