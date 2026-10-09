import { NextRequest } from "next/server";
import { db } from "@/db";
import { gateCamera } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { decryptSecrets, encryptSecrets } from "@/lib/integrations/accounting/connector";

export const dynamic = "force-dynamic";

/**
 * Network/IP camera for the gate (Hikvision/Dahua/... snapshot URL).
 * The browser cannot fetch a LAN camera directly, so the API proxies the
 * JPEG. Camera credentials are AES-encrypted; the settings panel opens only
 * with the owner-set admin password (bcrypt). Plaintexts never persist.
 */
const ConfigSchema = z.object({
  snapshotUrl: z.string().trim().min(8).max(1000),
  camUsername: z.string().trim().max(120).optional(),
  camPassword: z.string().max(200).optional(),
  /** Required always: first setup defines it, later changes must match it. */
  adminPassword: z.string().min(4).max(100),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WEIGHBRIDGE_READ);
  if ("status" in auth) return auth;
  const [row] = await db
    .select({ snapshotUrl: gateCamera.snapshotUrl, camUsername: gateCamera.camUsername, hasPassword: gateCamera.secretEnc, updatedAt: gateCamera.updatedAt })
    .from(gateCamera)
    .where(eq(gateCamera.tenantId, auth.user.tenantId))
    .limit(1);
  if (!row) return successResponse({ configured: false }, "لا كاميرا مربوطة");
  return successResponse(
    { configured: true, snapshotUrl: row.snapshotUrl, camUsername: row.camUsername, hasPassword: !!row.hasPassword, updatedAt: row.updatedAt },
    "OK"
  );
}

export async function PUT(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WEIGHBRIDGE_RECORD);
  if ("status" in auth) return auth;
  // Only the owner may (re)wire the camera — the gate officer operates it,
  // never configures it. This is the anti-tamper rule requested.
  if (auth.user.role !== "PLANT_MGR" && auth.user.role !== "SUPER_ADMIN")
    return errorResponse("FORBIDDEN", "ضبط الكاميرا للمالك فقط", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = ConfigSchema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid camera payload", 400);
  const d = parsed.data;
  if (!/^https?:\/\//i.test(d.snapshotUrl))
    return errorResponse("VALIDATION_ERROR", "رابط اللقطة يجب أن يبدأ بـ http", 400);

  const [existing] = await db
    .select({ adminHash: gateCamera.adminHash })
    .from(gateCamera)
    .where(eq(gateCamera.tenantId, auth.user.tenantId))
    .limit(1);
  if (existing && !(await bcrypt.compare(d.adminPassword, existing.adminHash)))
    return errorResponse("WRONG_PASSWORD", "كلمة سر الضبط غير صحيحة", 403);

  let secretEnc: string | null = null;
  if (d.camPassword) {
    try {
      secretEnc = encryptSecrets({ password: d.camPassword });
    } catch {
      return errorResponse(
        "NO_CRYPTO_KEY",
        "أضف INTEGRATION_CRYPTO_KEY في إعدادات الخادم أولاً (64 خانة hex) أو اترك كلمة سر الكاميرا فارغة",
        500
      );
    }
  }

  const adminHash = await bcrypt.hash(d.adminPassword, 10);
  await db.execute(
    (await import("drizzle-orm")).sql`
      INSERT INTO gate_camera (tenant_id, snapshot_url, cam_username, secret_enc, admin_hash, updated_at)
      VALUES (${auth.user.tenantId}, ${d.snapshotUrl}, ${d.camUsername || null}, ${secretEnc}, ${adminHash}, now())
      ON CONFLICT (tenant_id) DO UPDATE SET
        snapshot_url = EXCLUDED.snapshot_url, cam_username = EXCLUDED.cam_username,
        secret_enc = COALESCE(EXCLUDED.secret_enc, gate_camera.secret_enc),
        admin_hash = EXCLUDED.admin_hash, updated_at = now()`
  );
  return successResponse({ configured: true }, "تم ربط الكاميرا");
}
