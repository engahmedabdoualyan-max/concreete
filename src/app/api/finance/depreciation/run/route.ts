/**
 * /api/finance/depreciation/run
 * POST — «تشغيل إهلاك شهر» (?period=YYYY-MM أو في الجسم):
 *        يولّد قيد إهلاك لكل أصل فعّال لذلك الشهر مرة واحدة فقط
 *        (فريد tenant+asset+period — التشغيل المكرر لا يكرر القيد).
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { runDepreciation } from "@/lib/services/depreciation.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const RunSchema = z.object({
  /** YYYY-MM أو تاريخ داخل الشهر؛ الافتراضي = الشهر الحالي */
  period: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = RunSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "بيانات غير صحيحة", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const raw = parsed.data.period ?? req.nextUrl.searchParams.get("period") ?? "";
  const period = raw ? new Date(raw) : new Date();
  if (Number.isNaN(period.getTime())) {
    return errorResponse("VALIDATION_ERROR", "فترة غير صحيحة — استخدم YYYY-MM", 400);
  }

  try {
    const result = await runDepreciation(auth.user.tenantId, auth.user.sub, period);
    return successResponse(result, `تم تشغيل إهلاك الشهر ${result.periodMonth}`);
  } catch (err) {
    console.error("[POST /api/finance/depreciation/run]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("DEPRECIATION_RUN_ERROR", message, 500);
  }
}
