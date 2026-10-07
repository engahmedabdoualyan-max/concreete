import { NextRequest } from "next/server";
import { quotes } from "../../actions";

export const dynamic = "force-dynamic";

/** POST /api/procure/requests/[id]/quotes */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return quotes(req, { params });
}
