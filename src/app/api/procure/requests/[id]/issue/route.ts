import { NextRequest } from "next/server";
import { issue } from "../../actions";

export const dynamic = "force-dynamic";

/** POST /api/procure/requests/[id]/issue */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return issue(req, { params });
}
