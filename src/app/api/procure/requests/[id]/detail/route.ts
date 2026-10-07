import { NextRequest } from "next/server";
import { detail } from "../../actions";

export const dynamic = "force-dynamic";

/** GET /api/procure/requests/[id]/detail — request + quotes + approvals */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return detail(req, { params });
}
