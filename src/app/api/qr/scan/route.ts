/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/qr/scan — the one endpoint every QR sticker in the plant resolves to
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/qr/scan?code=...  — resolve a scanned or typed label
 *  POST /api/qr/scan           — same thing, for phone cameras that POST
 *
 *  WHO SEES WHAT
 *  ─────────────────────────────────────────────────────────
 *  Scanning is not free. Without `qr:scan` you get a 403 and no data at all —
 *  that is the point: the sticker is not a public business card.
 *
 *  Two tiers once you are allowed to scan:
 *
 *    FULL   (qr:read_full) — mechanic, workshop manager, plant manager,
 *            HR manager. The complete record behind the label: every repair,
 *            every oil change, every part ever fitted, costs.
 *
 *    BASIC  (qr:scan) — everyone else. Identity and "who is on it", nothing
 *            more. A driver scanning a mixer in the yard learns the truck code,
 *            the plate and the driver's name. They do NOT get the maintenance
 *            history, and they do not get it by asking this endpoint twice.
 *
 *  The redaction happens server-side in `scanLabel`, which never builds the
 *  wider payload in the first place for a BASIC caller — so there is no field
 *  that leaks because a filter was forgotten.
 *
 *  TENANCY
 *  ─────────────────────────────────────────────────────────
 *  The token lookup is scoped to the caller's tenant, so a label from another
 *  plant answers NOT_FOUND rather than "forbidden" — a scan must not double as a
 *  probe for which codes exist somewhere else.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS, userHasPermission } from "@/lib/auth/rbac";
import { scanLabel, type VisibilityTier } from "@/lib/services/asset-qr.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ScanSchema = z.object({
  // Whatever the scanner produced: "FIMTO|SP-000123|<hex>", or a typed hint.
  code: z
    .string()
    .trim()
    .min(6, "That does not look like an asset label")
    .max(400),
});

/**
 * Decide how much of the record this caller may have.
 *
 * FULL is *only* reachable through `qr:read_full`, which is granted to the
 * mechanic, workshop manager, plant manager and HR manager. Everyone else
 * collapses to BASIC no matter how many other permissions they hold — being a
 * sales rep or an accountant does not open another vehicle's maintenance file.
 */
function resolveTier(user: { role: string; permissions?: string[] | null }): VisibilityTier {
  return userHasPermission(
    user.role as never,
    user.permissions ?? [],
    PERMISSIONS.QR_READ_FULL
  )
    ? "FULL"
    : "BASIC";
}

async function handle(code: string, req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.QR_SCAN);
  if ("status" in auth) return auth;

  const parsed = ScanSchema.safeParse({ code });
  if (!parsed.success) {
    return errorResponse(
      "INVALID_LABEL",
      "Scan an asset label, or type the code printed under it.",
      400,
      parsed.error.flatten()
    );
  }

  const tier = resolveTier(auth.user);
  const result = await scanLabel({
    tenantId: auth.user.tenantId,
    raw: parsed.data.code,
    tier,
  });

  if (!result.ok) {
    // Also covers a label that exists but has been retired.
    return errorResponse(
      "LABEL_NOT_FOUND",
      "No asset matches that label. Check the code, or scan again — a label that has been scrapped keeps a record, so ask the workshop if it was disposed of.",
      404
    );
  }

  // The secret is never echoed back. The caller already has it (they scanned the
  // sticker); returning it would turn any read endpoint into a label-forging
  // oracle.
  const { tokenHash: _tokenHash, ...safeLabel } = result.label;

  return successResponse(
    {
      label: safeLabel,
      subject: result.subject,
      currentBinding: result.currentBinding,
      history: result.history ?? null,
      tier: result.tier,
    },
    result.tier === "FULL"
      ? "Full record"
      : "Identity only — full history needs workshop access"
  );
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return errorResponse(
      "MISSING_CODE",
      "Pass ?code= with the scanned value or the printed label code.",
      400
    );
  }
  return handle(code, req);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_BODY", "Expected a JSON body with `code`.", 400);
  }

  const code = (body as { code?: string } | null)?.code;
  if (typeof code !== "string" || !code.trim()) {
    return errorResponse(
      "MISSING_CODE",
      "Expected a JSON body with `code`.",
      400
    );
  }
  return handle(code, req);
}