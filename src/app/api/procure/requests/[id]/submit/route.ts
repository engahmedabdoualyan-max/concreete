import { NextRequest } from "next/server";
import { submit } from "../../actions";

export const dynamic = "force-dynamic";

/** POST /api/procure/requests/[id]/submit */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return submit(req, { params });
}
