/**
 * /api/finance/commitments
 * GET  — list commitments (+ payments), summary, overdue auto-roll
 * POST — create a commitment
 */

import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  listCommitments,
  listOverdueCommitments,
  createCommitment,
  refreshCommitmentSchedules,
} from "@/lib/services/commitments.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateCommitmentSchema = z.object({
  title: z.string().min(2, "العنوان مطلوب"),
  commitmentType: z.enum(["emi", "lease", "insurance", "maintenance", "utilities", "rent", "other"]),
  description: z.string().optional().nullable(),
  amountSar: z.number().int().positive("المبلغ يجب أن يكون موجباً"),
  referenceNumber: z.string().optional().nullable(),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  endDate: z.string().optional().nullable(),
  paymentFrequency: z.enum(["monthly", "quarterly", "half_yearly", "yearly", "one_time"]),
  paymentDay: z.number().int().min(1).max(31).optional(),
  nextPaymentDate: z.string().optional().nullable(),
  payeeName: z.string().min(2, "اسم الجهة مطلوب"),
  contactPerson: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  contactEmail: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  try {
    const [commitments, overdue] = await Promise.all([
      listCommitments(auth.user.tenantId),
      listOverdueCommitments(auth.user.tenantId),
    ]);

    // Auto-roll stale schedules (idempotent)
    let rolled: string[] = [];
    try {
      rolled = await refreshCommitmentSchedules(auth.user.tenantId);
      if (rolled.length) {
        const fresh = await listCommitments(auth.user.tenantId);
        return successResponse({
          commitments: fresh,
          overdue: await listOverdueCommitments(auth.user.tenantId),
          summary: summarize(fresh),
          rolled,
        });
      }
    } catch (e) {
      console.error("[commitments refresh]", e);
    }

    return successResponse({ commitments, overdue, summary: summarize(commitments), rolled });
  } catch (err) {
    console.error("[GET /api/finance/commitments]", err);
    return errorResponse("COMMITMENTS_FETCH_ERROR", "Failed to load commitments", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateCommitmentSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid commitment data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  const startDate = new Date(d.startDate);

  try {
    const commitment = await createCommitment(auth.user.tenantId, auth.user.sub, {
      title: d.title,
      commitmentType: d.commitmentType,
      description: d.description ?? null,
      amountSar: d.amountSar,
      referenceNumber: d.referenceNumber ?? null,
      startDate,
      endDate: d.endDate ? new Date(d.endDate) : null,
      paymentFrequency: d.paymentFrequency,
      paymentDay: d.paymentDay ?? 1,
      nextPaymentDate: d.nextPaymentDate ? new Date(d.nextPaymentDate) : null,
      payeeName: d.payeeName,
      contactPerson: d.contactPerson ?? null,
      contactPhone: d.contactPhone ?? null,
      contactEmail: d.contactEmail ?? null,
      notes: d.notes ?? null,
    });
    return successResponse({ commitment }, "تم إضافة الالتزام");
  } catch (err) {
    console.error("[POST /api/finance/commitments]", err);
    return errorResponse("COMMITMENT_CREATE_ERROR", "Failed to create commitment", 500);
  }
}

function summarize(list: Awaited<ReturnType<typeof listCommitments>>) {
  const active = list.filter((c) => c.status === "active");
  const monthlyTotal = active.reduce((s, c) => {
    if (c.paymentFrequency === "one_time") return s;
    const factor =
      c.paymentFrequency === "monthly" ? 1 :
      c.paymentFrequency === "quarterly" ? 1 / 3 :
      c.paymentFrequency === "half_yearly" ? 1 / 6 : 1 / 12;
    return s + c.amountSar * factor;
  }, 0);
  return {
    total: list.length,
    active: active.length,
    monthlyTotalSar: Math.round(monthlyTotal),
    nextPaymentSar: active
      .filter((c) => c.currentPaymentIsPaid === false)
      .reduce((s, c) => s + c.amountSar, 0),
  };
}
