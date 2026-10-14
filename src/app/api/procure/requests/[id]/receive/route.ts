import { NextRequest } from "next/server";
import { receive } from "../../actions";

export const dynamic = "force-dynamic";

/** POST /api/procure/requests/[id]/receive */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return receive(req, { params });
}
