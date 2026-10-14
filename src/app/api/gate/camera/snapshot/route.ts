import { NextRequest } from "next/server";
import { db } from "@/db";
import { gateCamera } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { decryptSecrets } from "@/lib/integrations/accounting/connector";

export const dynamic = "force-dynamic";

/**
 * GET /api/gate/camera/snapshot — proxied JPEG from the LAN camera.
 * The browser cannot reach the camera directly, so the server fetches with
 * the stored credentials and streams the bytes back (5s cap).
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WEIGHBRIDGE_READ);
  if ("status" in auth) return auth;
  const [row] = await db
    .select()
    .from(gateCamera)
    .where(eq(gateCamera.tenantId, auth.user.tenantId))
    .limit(1);
  if (!row) return errorResponse("NO_CAMERA", "لا كاميرا مربوطة بعد", 404);

  const headers: Record<string, string> = {};
  if (row.camUsername) {
    let password = "";
    if (row.secretEnc) {
      try {
        password = decryptSecrets(row.secretEnc).password ?? "";
      } catch {
        return errorResponse("CRYPTO_FAILED", "تعذر فك تشفير بيانات الكاميرا", 500);
      }
    }
    headers.Authorization = `Basic ${Buffer.from(`${row.camUsername}:${password}`).toString("base64")}`;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(row.snapshotUrl, { headers, signal: ctrl.signal });
    if (!res.ok) return errorResponse("CAM_FAILED", `الكاميرا ردت ${res.status}`, 502);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return errorResponse("CAM_EMPTY", "الكاميرا لم ترسل صورة", 502);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return errorResponse("CAM_UNREACHABLE", "تعذر الوصول للكاميرا — تحقق من الشبكة والرابط", 502);
  } finally {
    clearTimeout(timer);
  }
}
