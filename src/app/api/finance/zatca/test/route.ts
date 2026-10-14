/**
 * ============================================================
 *  POST /api/finance/zatca/test — verify the ZATCA connection
 * ============================================================
 *  WHY
 *  Configuring e-invoicing is a one-time task, but without a way to check it
 *  the accountant finds out at 23:00 that the CSID is wrong, while a customer
 *  invoice is waiting. This endpoint performs the real handshake with Fatoora
 *  and stores the outcome on the integration record, so the screen can show
 *  "connected / not connected, and why".
 *
 *  WHAT IT DOES
 *    1. refuses clearly when the credentials are not configured yet, and
 *       returns exactly what is missing (never a generic 500)
 *    2. calls the Fatoora compliance/validation endpoint for the configured
 *       environment with the stored CSID + secret
 *    3. records the attempt (lastTestedAt / lastTestOk / lastTestMessage) so
 *       the state survives a page reload
 *
 *  RBAC: FINANCE_INVOICE_MANAGE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Fatoora gateway per environment (same map the issue flow uses). */
const GATEWAYS: Record<string, string> = {
  sandbox: "https://gw-fatoora.zatca.gov.sa/e-invoicing/sandbox",
  simulation: "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation",
  production: "https://gw-fatoora.zatca.gov.sa/e-invoicing/core",
};

const ZatcaConfigShape = z
  .object({
    env: z.enum(["sandbox", "simulation", "production"]).default("simulation"),
    credentialsEnc: z.string().min(1),
  })
  .passthrough();

/** Decrypt helper is imported lazily to keep the key handling in one place. */
async function loadSecrets(tenantId: string) {
  const rows = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const settings = (rows[0]?.settings ?? {}) as Record<string, unknown>;
  const parsed = ZatcaConfigShape.safeParse(settings.zatca ?? {});
  if (!parsed.success || !parsed.data.credentialsEnc) return null;
  const { decryptSecrets } = await import(
    "@/lib/integrations/accounting/connector"
  );
  try {
    return decryptSecrets(parsed.data.credentialsEnc);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_INVOICE_MANAGE);
  if ("status" in auth) return auth;
  const tenantId = auth.user.tenantId;

  const rate = checkNextRateLimit(
    `zatca-test:${tenantId}:${clientIpFromHeaders(req.headers)}`,
    5
  );
  if (!rate.allowed) {
    return errorResponse("RATE_LIMITED", "محاولات كثيرة — استنى دقيقة", 429, {
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }

  const settingsRow = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const settings = (settingsRow[0]?.settings ?? {}) as Record<string, unknown>;
  const zcfg = (settings.zatca ?? {}) as Record<string, unknown>;
  const env = (zcfg.env as string) || "simulation";

  const record = async (ok: boolean, message: string) => {
    await db
      .update(tenants)
      .set({
        settings: {
          ...settings,
          zatca: {
            ...zcfg,
            lastTestedAt: new Date().toISOString(),
            lastTestOk: ok,
            lastTestMessage: message.slice(0, 480),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));
  };

  // ── 1. what is missing ────────────────────────────────────────────────────
  const missing: string[] = [];
  if (!zcfg.sellerName) missing.push("اسم البائع (sellerName)");
  if (!zcfg.vatNumber) missing.push("الرقم الضريبي (vatNumber)");
  const secrets = await loadSecrets(tenantId);
  if (!secrets?.binaryToken) missing.push("الرقم السري (CSID / binaryToken)");
  if (!secrets?.secret) missing.push("الرمز السري (secret)");
  if (missing.length || !secrets) {
    const all = secrets ? missing : [...missing, "إعدادات التشفير"];
    await record(false, `ناقص: ${all.join("، ")}`);
    return errorResponse("ZATCA_NOT_CONFIGURED", "لسه فيه بيانات ناقصة", 409, {
      missing: all,
    });
  }

  // ── 2. the real handshake ─────────────────────────────────────────────────
  const gateway = GATEWAYS[env] ?? GATEWAYS.simulation;
  const basic = Buffer.from(`${secrets.binaryToken}:${secrets.secret}`).toString("base64");
  let ok = false;
  let message = "";
  let statusCode = 0;
  try {
    // The compliance endpoint answers for any valid CSID and echoes the
    // taxpayer status, which is exactly what "are we connected" means.
    const res = await fetch(`${gateway}/compliance`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Version": "V2",
        "Accept-Language": "en",
        Authorization: `Basic ${basic}`,
      },
      signal: AbortSignal.timeout(20_000),
    });
    statusCode = res.status;
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      ok = true;
      const compliance = body?.complianceStatus ?? (body as any)?.result?.complianceStatus;
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      message = `متصل بـ${env === "production" ? "الإنتاج" : env === "sandbox" ? "بيئة الاختبار" : "ال-simulated"}`
        + (compliance ? ` — حالة الالتزام: ${compliance}` : "")
        + (messages.length ? ` — ${messages.length} رسالة` : "");
    } else {
      const validation = (body as any)?.validationResults;
      const detail = Array.isArray(validation?.errorMessages)
        ? validation.errorMessages.map((m: any) => m.message).join("، ")
        : (body as any)?.message || `HTTP ${res.status}`;
      message = `فشل الاتصال: ${detail}`;
    }
  } catch (err) {
    message = `تعذّر الوصول لبوابة هيئة الزكاة: ${(err as Error).message}`;
  }

  await record(ok, message);

  return successResponse({
    ok,
    env,
    httpStatus: statusCode || null,
    message,
    testedAt: new Date().toISOString(),
  });
}
