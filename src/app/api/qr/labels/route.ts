/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/qr/labels — mint, reprint and print asset QR labels
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/qr/labels?subjectType=…&subjectId=…  — label for one subject
 *  GET  /api/qr/labels?subjectType=…&subjectIds=…  — print sheet for a list
 *  POST /api/qr/labels                             — issue a label
 *  PATCH /api/qr/labels                            — reprint (rotates the secret)
 *
 *  THE SECRET IS RETURNED EXACTLY ONCE
 *  ─────────────────────────────────────────────────────────
 *  `issueLabel` hands back the plaintext token for the caller to put on the
 *  sticker; only its SHA-256 is kept. A caller that loses the response has to
 *  reprint, which rotates the secret. That is deliberate: a recoverable secret
 *  is a forgeable secret, and a second sticker for the same part must never be a
 *  second identity.
 *
 *  Printing stock is controlled (`qr:label_print`): every label issued is an
 *  audit row, so a missing part can always be traced to who printed its label.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { assetQrLabels, auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  issueLabel,
  reissueLabel,
  buildQrPayload,
  markPrinted,
} from "@/lib/services/asset-qr.service";
import { and, eq, inArray, sql, desc } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SUBJECT_TYPES = [
  "ITEM_CARD",
  "ITEM_UNIT",
  "EMPLOYEE",
  "EQUIPMENT",
  "VEHICLE",
  "CHALLAN",
  "CONCRETE_SAMPLE",
] as const;

const SubjectTypeEnum = z.enum(SUBJECT_TYPES);

const IssueSchema = z.object({
  subjectType: SubjectTypeEnum,
  subjectId: z.string().uuid("subjectId must be a UUID"),
  /** The subject's own human code — frozen onto the label. */
  subjectRef: z.string().trim().min(1).max(80),
  subjectLabel: z.string().trim().max(200).optional().nullable(),
});

const ReprintSchema = z.object({
  labelId: z.string().uuid("labelId must be a UUID"),
  reason: z.string().trim().min(3).max(200),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.QR_SCAN);
  if ("status" in auth) return auth;

  const sp = req.nextUrl.searchParams;
  const subjectType = sp.get("subjectType");

  if (subjectType) {
    const parsedType = SubjectTypeEnum.safeParse(subjectType);
    if (!parsedType.success) {
      return errorResponse(
        "INVALID_SUBJECT_TYPE",
        `subjectType must be one of: ${SUBJECT_TYPES.join(", ")}`,
        400
      );
    }

    const many = sp.get("subjectIds");
    const ids = many
      ? many.split(",").map((s) => s.trim()).filter(Boolean)
      : [sp.get("subjectId")].filter(Boolean) as string[];

    if (ids.length === 0) {
      return errorResponse(
        "MISSING_SUBJECT",
        "Pass subjectId, or subjectIds as a comma-separated list.",
        400
      );
    }
    if (ids.some((id) => !z.string().uuid().safeParse(id).success)) {
      return errorResponse(
        "INVALID_SUBJECT_ID",
        "Every subjectId must be a UUID.",
        400
      );
    }

    const rows = await db
      .select()
      .from(assetQrLabels)
      .where(
        and(
          eq(assetQrLabels.tenantId, auth.user.tenantId),
          eq(assetQrLabels.subjectType, parsedType.data),
          inArray(assetQrLabels.subjectId, ids),
          sql`${assetQrLabels.state} <> 'RETIRED'`
        )
      );

    // Never return the hash — it is the only thing standing between a database
    // dump and a set of forgeable labels.
    return successResponse(
      rows.map(({ tokenHash: _h, ...rest }) => rest),
      "Labels found"
    );
  }

  const listed = await db
    .select()
    .from(assetQrLabels)
    .where(eq(assetQrLabels.tenantId, auth.user.tenantId))
    .orderBy(desc(assetQrLabels.createdAt))
    .limit(Number(sp.get("limit") ?? 100));

  return successResponse(
    listed.map(({ tokenHash: _h, ...rest }) => rest),
    "Labels"
  );
}

// ─── POST — issue ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.QR_LABEL_PRINT);
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = IssueSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "INVALID_BODY",
      parsed.error.issues[0]?.message ?? "Invalid label request.",
      400,
      parsed.error.flatten()
    );
  }

  const result = await issueLabel({
    tenantId: auth.user.tenantId,
    subjectType: parsed.data.subjectType,
    subjectId: parsed.data.subjectId,
    subjectRef: parsed.data.subjectRef,
    subjectLabel: parsed.data.subjectLabel ?? null,
    issuedById: auth.user.sub,
  });

  const alreadyExisted = result.token === null;

  if (!alreadyExisted) {
    await markPrinted(result.label.id);
    await db.insert(auditLogs).values({
      userId: auth.user.sub,
      tenantId: auth.user.tenantId,
      action: "QR_LABEL_ISSUED",
      entityType: "asset_qr_labels",
      entityId: result.label.id,
      newState: {
        labelCode: result.label.labelCode,
        subjectType: result.label.subjectType,
        subjectId: result.label.subjectId,
        subjectRef: result.label.subjectRef,
      },
    });
  }

  const { tokenHash: _h, ...safeLabel } = result.label;

  return successResponse(
    {
      label: safeLabel,
      /** The one-time plaintext. Null when the label already existed. */
      qrPayload: result.token ? buildQrPayload(result.label.labelCode, result.token) : null,
      alreadyIssued: alreadyExisted,
    },
    alreadyExisted
      ? "This subject was already labelled — reprint from the label list if the sticker is damaged."
      : "Label issued. Print it now; the code cannot be recovered later.",
    alreadyExisted ? 200 : 201
  );
}

// ─── PATCH — reprint ──────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.QR_LABEL_PRINT);
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = ReprintSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "INVALID_BODY",
      parsed.error.issues[0]?.message ?? "Invalid reprint request.",
      400,
      parsed.error.flatten()
    );
  }

  const result = await reissueLabel({
    tenantId: auth.user.tenantId,
    labelId: parsed.data.labelId,
    issuedById: auth.user.sub,
  });

  if (!result.ok) {
    return errorResponse("LABEL_NOT_FOUND", "No such label in your plant.", 404);
  }

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: auth.user.tenantId,
    action: "QR_LABEL_REISSUED",
    entityType: "asset_qr_labels",
    entityId: result.label.id,
    previousState: { tokenHint: result.label.tokenHint, printCount: result.label.printCount },
    newState: {
      labelCode: result.label.labelCode,
      reason: parsed.data.reason,
      printCount: result.label.printCount,
      note: "Old sticker no longer scans — the secret was rotated.",
    },
  });

  const { tokenHash: _h, ...safeLabel } = result.label;

  return successResponse(
    {
      label: safeLabel,
      qrPayload: buildQrPayload(result.label.labelCode, result.token),
      warning:
        "The previous sticker no longer scans. Destroy it, or two codes will resolve to the same asset.",
    },
    "Label reprinted"
  );
}