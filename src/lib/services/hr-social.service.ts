/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  HR Social Service (Epic 12)
 * ============================================================
 *
 *  Two-way bridge:
 *   • Requests: ANY authenticated employee files LEAVE / ADVANCE /
 *     SALARY_CONFIRM / OTHER (own scope). HR_WRITE reviews.
 *     Push ping on file (→ HR officers) and on review (→ requester).
 *   • Broadcasts: HR_WRITE publishes to roles/all; readers mark read.
 *     Push fan-out to registered tokens on publish.
 * ============================================================
 */

import { db } from "@/db";
import {
  hrRequests,
  hrBroadcasts,
  hrBroadcastReads,
  hrLeaveBalances,
  payrollEmployees,
  users,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { sendPush, sendPushToRoles } from "./push.service";

export type HrRequestType = "LEAVE" | "ADVANCE" | "SALARY_CONFIRM" | "OTHER";

const TYPE_AR: Record<HrRequestType, string> = {
  LEAVE: "طلب إجازة",
  ADVANCE: "طلب سلفة",
  SALARY_CONFIRM: "تأكيد استلام راتب",
  OTHER: "طلب آخر",
};

// ─── Requests ─────────────────────────────────────────────────────────────────

export async function createRequest(
  tenantId: string,
  userId: string,
  input: {
    type: HrRequestType;
    startDate?: string;
    endDate?: string;
    amountSar?: number;
    referenceId?: string;
    reason?: string;
  }
) {
  const [created] = await db
    .insert(hrRequests)
    .values({
      tenantId,
      requesterId: userId,
      type: input.type,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      amountSar: input.amountSar !== undefined ? String(input.amountSar) : null,
      referenceId: input.referenceId,
      reason: input.reason,
    })
    .returning();

  const requester = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Ping HR officers (fire-and-forget — request is already stored)
  void sendPushToRoles(
    tenantId,
    ["HR_OFFICER", "SUPER_ADMIN", "PLANT_MGR"],
    `📩 ${TYPE_AR[input.type]} جديد`,
    `${requester[0]?.fullName ?? "موظف"} — ${input.reason ?? ""}`.slice(0, 180),
    { kind: "hr_request", requestId: created.id }
  ).catch(() => {});

  return created;
}

export async function listMyRequests(tenantId: string, userId: string) {
  return db
    .select()
    .from(hrRequests)
    .where(and(eq(hrRequests.tenantId, tenantId), eq(hrRequests.requesterId, userId)))
    .orderBy(desc(hrRequests.createdAt))
    .limit(100);
}

export async function listAllRequests(
  tenantId: string,
  status?: string,
  type?: string
) {
  const conds = [eq(hrRequests.tenantId, tenantId)];
  if (status) conds.push(eq(hrRequests.status, status));
  if (type) conds.push(eq(hrRequests.type, type));

  return db
    .select({
      id: hrRequests.id,
      type: hrRequests.type,
      status: hrRequests.status,
      startDate: hrRequests.startDate,
      endDate: hrRequests.endDate,
      amountSar: hrRequests.amountSar,
      referenceId: hrRequests.referenceId,
      reason: hrRequests.reason,
      reviewNote: hrRequests.reviewNote,
      reviewedAt: hrRequests.reviewedAt,
      createdAt: hrRequests.createdAt,
      requesterId: hrRequests.requesterId,
      requesterName: users.fullName,
    })
    .from(hrRequests)
    .innerJoin(users, eq(hrRequests.requesterId, users.id))
    .where(and(...conds))
    .orderBy(desc(hrRequests.createdAt))
    .limit(200);
}

export async function reviewRequest(
  tenantId: string,
  reviewerId: string,
  requestId: string,
  decision: "APPROVED" | "REJECTED",
  reviewNote?: string
) {
  const [updated] = await db
    .update(hrRequests)
    .set({
      status: decision,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      reviewNote: reviewNote?.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(hrRequests.id, requestId),
        eq(hrRequests.tenantId, tenantId),
        eq(hrRequests.status, "PENDING")
      )
    )
    .returning();
  if (!updated) return null;

  // Approving a LEAVE with a day count consumes the yearly balance (may go
  // negative = overuse, shown as-is; the row auto-creates at 0 so no
  // entitlement is ever invented).
  if (decision === "APPROVED" && updated.type === "LEAVE") {
    void consumeLeaveBalance(tenantId, updated).catch((e) =>
      console.error("[leave-balance]", e)
    );
  }

  // Notify the requester (fire-and-forget)
  void sendPush(
    tenantId,
    {
      toUserId: updated.requesterId,
      title:
        decision === "APPROVED"
          ? `✅ تم قبول ${TYPE_AR[updated.type as HrRequestType] ?? "طلبك"}`
          : `❌ تم رفض ${TYPE_AR[updated.type as HrRequestType] ?? "طلبك"}`,
      body: (reviewNote ?? "").slice(0, 180) || "راجع تطبيق الموارد البشرية للتفاصيل.",
      data: { kind: "hr_review", requestId: updated.id, decision },
    }
  ).catch(() => {});

  return updated;
}

async function consumeLeaveBalance(
  tenantId: string,
  req: { requesterId: string; startDate: Date | null; endDate: Date | null }
): Promise<void> {
  let days = 0;
  if (req.startDate && req.endDate) {
    days = Math.round((+new Date(req.endDate) - +new Date(req.startDate)) / 864e5) + 1;
  }
  if (!Number.isFinite(days) || days <= 0) return;
  const year = (req.startDate ? new Date(req.startDate) : new Date()).getFullYear();

  const emp = await db
    .select({ id: payrollEmployees.id })
    .from(payrollEmployees)
    .where(and(eq(payrollEmployees.tenantId, tenantId), eq(payrollEmployees.userId, req.requesterId)));
  if (emp.length === 0) return;

  const existing = await db
    .select()
    .from(hrLeaveBalances)
    .where(
      and(
        eq(hrLeaveBalances.tenantId, tenantId),
        eq(hrLeaveBalances.employeeId, emp[0].id),
        eq(hrLeaveBalances.year, year),
        eq(hrLeaveBalances.leaveType, "ANNUAL")
      )
    );
  if (existing.length > 0) {
    await db
      .update(hrLeaveBalances)
      .set({ used: sql`${hrLeaveBalances.used} + ${days}` })
      .where(eq(hrLeaveBalances.id, existing[0].id));
  } else {
    await db.insert(hrLeaveBalances).values({
      tenantId,
      employeeId: emp[0].id,
      year,
      leaveType: "ANNUAL",
      allocated: "0",
      used: String(days),
    });
  }
}

export async function cancelRequest(tenantId: string, userId: string, requestId: string) {  const [updated] = await db
    .update(hrRequests)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(hrRequests.id, requestId),
        eq(hrRequests.tenantId, tenantId),
        eq(hrRequests.requesterId, userId),
        eq(hrRequests.status, "PENDING")
      )
    )
    .returning({ id: hrRequests.id });
  return !!updated;
}

// ─── Broadcasts ───────────────────────────────────────────────────────────────

export async function createBroadcast(
  tenantId: string,
  userId: string,
  input: { title: string; body: string; audience?: string[] }
) {
  const [created] = await db
    .insert(hrBroadcasts)
    .values({
      tenantId,
      title: input.title,
      body: input.body,
      audience: input.audience ?? [],
      createdById: userId,
    })
    .returning();

  // Fan-out push (fire-and-forget)
  if (!input.audience || input.audience.length === 0) {
    // Everyone: ping all role groups that use the mobile app
    void sendPushToRoles(
      tenantId,
      ["DRIVER", "SALES_REP", "RND_MANAGER", "HR_OFFICER", "WORKSHOP_MGR", "BATCH_OPERATOR", "LAB_TECH", "DISPATCHER", "SUPER_ADMIN", "PLANT_MGR", "ACCOUNTANT", "FINANCE"],
      `📢 ${input.title}`,
      input.body.slice(0, 180),
      { kind: "hr_broadcast", broadcastId: created.id }
    ).catch(() => {});
  } else {
    void sendPushToRoles(
      tenantId,
      input.audience,
      `📢 ${input.title}`,
      input.body.slice(0, 180),
      { kind: "hr_broadcast", broadcastId: created.id }
    ).catch(() => {});
  }

  return created;
}

export async function listBroadcasts(tenantId: string, userId: string, userRole: string) {
  const rows = await db
    .select()
    .from(hrBroadcasts)
    .where(eq(hrBroadcasts.tenantId, tenantId))
    .orderBy(desc(hrBroadcasts.createdAt))
    .limit(50);

  const reads = await db
    .select({ broadcastId: hrBroadcastReads.broadcastId })
    .from(hrBroadcastReads)
    .where(
      and(eq(hrBroadcastReads.tenantId, tenantId), eq(hrBroadcastReads.userId, userId))
    );
  const readSet = new Set(reads.map((r) => r.broadcastId));

  // Audience filter: empty = everyone; targeted = role members + author
  return rows
    .filter((b) => {
      const aud = (b.audience ?? []) as string[];
      return (
        aud.length === 0 || aud.includes(userRole) || b.createdById === userId
      );
    })
    .map((b) => ({ ...b, read: readSet.has(b.id) }));
}

export async function markBroadcastRead(
  tenantId: string,
  userId: string,
  broadcastId: string
) {
  // Idempotent: skip if already read
  const existing = await db
    .select({ id: hrBroadcastReads.id })
    .from(hrBroadcastReads)
    .where(
      and(
        eq(hrBroadcastReads.broadcastId, broadcastId),
        eq(hrBroadcastReads.userId, userId),
        eq(hrBroadcastReads.tenantId, tenantId)
      )
    )
    .limit(1);
  if (existing[0]) return true;

  await db.insert(hrBroadcastReads).values({ tenantId, broadcastId, userId });
  return true;
}

export async function broadcastReadCount(tenantId: string, broadcastId: string) {
  const rows = await db
    .select({ id: hrBroadcastReads.id })
    .from(hrBroadcastReads)
    .where(
      and(
        eq(hrBroadcastReads.broadcastId, broadcastId),
        eq(hrBroadcastReads.tenantId, tenantId)
      )
    );
  return rows.length;
}
