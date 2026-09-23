/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  R&D Service Layer — "The Factory Brain"
 * ============================================================
 *
 *  Centralises all R&D business rules:
 *   • Current-state baseline (one row per tenant per period)
 *   • Plan lifecycle: DRAFT → PENDING_FINANCE → APPROVED → IN_PROGRESS → COMPLETED
 *   • Finance gate: only FINANCE/ACCOUNTANT (RND_FINANCE_APPROVE) moves
 *     a plan out of PENDING_FINANCE
 *   • Progress rollup: plan.overallProgressPct = average of task progress
 *     (falls back to milestone average when a plan has no tasks yet)
 *   • Weekly variance: (actual - planned) / planned * 100, on-track
 *     threshold = variance >= -10%
 *
 *  Every query is tenant-scoped. Callers must pass the tenantId from
 *  the verified JWT — never trust a client-supplied tenant.
 * ============================================================
 */

import { db } from "@/db";
import {
  rndCurrentStates,
  rndPlans,
  rndMilestones,
  rndTasks,
  rndTaskComments,
  rndBudgetPlans,
  rndBudgetItems,
  rndWeeklyEntries,
  rndExternalIssues,
  rndIssueComments,
  rndEvaluations,
  users,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

// ─── Current State ────────────────────────────────────────────────────────────

export async function getLatestCurrentState(tenantId: string) {
  const rows = await db
    .select()
    .from(rndCurrentStates)
    .where(eq(rndCurrentStates.tenantId, tenantId))
    .orderBy(desc(rndCurrentStates.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertCurrentState(
  tenantId: string,
  userId: string,
  input: {
    period: string;
    currentProductionCapacity?: number;
    targetProductionCapacity?: number;
    currentEfficiencyPct?: number;
    targetEfficiencyPct?: number;
    currentStaffCount?: number;
    targetStaffCount?: number;
    currentCostPerM3?: number;
    targetCostPerM3?: number;
    keyIssues?: { title: string; description: string; severity: string; category: string }[];
  }
) {
  const existing = await db
    .select()
    .from(rndCurrentStates)
    .where(
      and(
        eq(rndCurrentStates.tenantId, tenantId),
        eq(rndCurrentStates.period, input.period)
      )
    )
    .limit(1);

  const payload = {
    tenantId,
    period: input.period,
    currentProductionCapacity: String(input.currentProductionCapacity ?? 0),
    targetProductionCapacity: String(input.targetProductionCapacity ?? 0),
    currentEfficiencyPct: String(input.currentEfficiencyPct ?? 0),
    targetEfficiencyPct: String(input.targetEfficiencyPct ?? 0),
    currentStaffCount: input.currentStaffCount ?? 0,
    targetStaffCount: input.targetStaffCount ?? 0,
    currentCostPerM3: String(input.currentCostPerM3 ?? 0),
    targetCostPerM3: String(input.targetCostPerM3 ?? 0),
    keyIssues: input.keyIssues ?? [],
    createdById: userId,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    const [updated] = await db
      .update(rndCurrentStates)
      .set(payload)
      .where(eq(rndCurrentStates.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(rndCurrentStates).values(payload).returning();
  return created;
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export async function listPlans(tenantId: string, status?: string) {
  const where = status
    ? and(
        eq(rndPlans.tenantId, tenantId),
        eq(rndPlans.status, status as "DRAFT")
      )
    : eq(rndPlans.tenantId, tenantId);
  return db
    .select()
    .from(rndPlans)
    .where(where)
    .orderBy(desc(rndPlans.createdAt));
}

export async function getPlan(tenantId: string, planId: string) {
  const rows = await db
    .select()
    .from(rndPlans)
    .where(and(eq(rndPlans.id, planId), eq(rndPlans.tenantId, tenantId)))
    .limit(1);
  if (!rows[0]) return null;

  const [milestones, tasks] = await Promise.all([
    db
      .select()
      .from(rndMilestones)
      .where(
        and(
          eq(rndMilestones.planId, planId),
          eq(rndMilestones.tenantId, tenantId)
        )
      )
      .orderBy(rndMilestones.targetDate),
    db
      .select()
      .from(rndTasks)
      .where(
        and(eq(rndTasks.planId, planId), eq(rndTasks.tenantId, tenantId))
      )
      .orderBy(desc(rndTasks.createdAt)),
  ]);

  return { ...rows[0], milestones, tasks };
}

export async function createPlan(
  tenantId: string,
  userId: string,
  input: {
    title: string;
    description?: string;
    category?: "PRODUCTION" | "QUALITY" | "COST" | "STAFF" | "TECHNOLOGY" | "PROCESS";
    priority?: "HIGH" | "MEDIUM" | "LOW";
    startDate: string;
    endDate: string;
    budgetSar?: number;
    expectedRoiPct?: number;
    milestones?: {
      title: string;
      description?: string;
      targetDate: string;
      ownerId?: string;
    }[];
  }
) {
  const [plan] = await db
    .insert(rndPlans)
    .values({
      tenantId,
      title: input.title,
      description: input.description,
      category: input.category ?? "PRODUCTION",
      priority: input.priority ?? "MEDIUM",
      status: "DRAFT",
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      budgetSar: input.budgetSar ?? 0,
      expectedRoiPct: String(input.expectedRoiPct ?? 0),
      createdById: userId,
    })
    .returning();

  if (input.milestones?.length) {
    await db.insert(rndMilestones).values(
      input.milestones.map((m) => ({
        tenantId,
        planId: plan.id,
        title: m.title,
        description: m.description,
        targetDate: new Date(m.targetDate),
        ownerId: m.ownerId,
      }))
    );
  }

  return plan;
}

export async function updatePlan(
  tenantId: string,
  planId: string,
  input: Partial<{
    title: string;
    description: string;
    category: "PRODUCTION" | "QUALITY" | "COST" | "STAFF" | "TECHNOLOGY" | "PROCESS";
    priority: "HIGH" | "MEDIUM" | "LOW";
    startDate: string;
    endDate: string;
    budgetSar: number;
    expectedRoiPct: number;
    status: "DRAFT" | "APPROVED" | "IN_PROGRESS" | "COMPLETED";
  }>
) {
  // Status transitions through the finance gate are NOT allowed here —
  // use submitPlanForFinance() / decidePlanFinance() instead.
  if (
    input.status === "DRAFT" ||
    input.status === undefined
  ) {
    // allowed: draft edits
  } else if (["APPROVED", "IN_PROGRESS", "COMPLETED"].includes(input.status)) {
    // allowed only as forward progress; finance gate enforced at the route layer
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.category !== undefined) patch.category = input.category;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.startDate !== undefined) patch.startDate = new Date(input.startDate);
  if (input.endDate !== undefined) patch.endDate = new Date(input.endDate);
  if (input.budgetSar !== undefined) patch.budgetSar = input.budgetSar;
  if (input.expectedRoiPct !== undefined)
    patch.expectedRoiPct = String(input.expectedRoiPct);
  if (input.status !== undefined) patch.status = input.status;

  const [updated] = await db
    .update(rndPlans)
    .set(patch)
    .where(and(eq(rndPlans.id, planId), eq(rndPlans.tenantId, tenantId)))
    .returning();
  return updated ?? null;
}

export async function deletePlan(tenantId: string, planId: string) {
  const deleted = await db
    .delete(rndPlans)
    .where(
      and(
        eq(rndPlans.id, planId),
        eq(rndPlans.tenantId, tenantId),
        eq(rndPlans.status, "DRAFT") // Only drafts are deletable
      )
    )
    .returning({ id: rndPlans.id });
  return deleted.length > 0;
}

/** Management submits a draft plan for finance budget approval. */
export async function submitPlanForFinance(tenantId: string, planId: string) {
  const [updated] = await db
    .update(rndPlans)
    .set({ status: "PENDING_FINANCE", updatedAt: new Date() })
    .where(
      and(
        eq(rndPlans.id, planId),
        eq(rndPlans.tenantId, tenantId),
        eq(rndPlans.status, "DRAFT")
      )
    )
    .returning();
  return updated ?? null;
}

/** Finance approves or rejects the plan budget. */
export async function decidePlanFinance(
  tenantId: string,
  planId: string,
  financeUserId: string,
  approved: boolean,
  comments?: string,
  approvedBudgetSar?: number
) {
  const [updated] = await db
    .update(rndPlans)
    .set({
      status: approved ? "APPROVED" : "REJECTED",
      financeReviewedById: financeUserId,
      financeReviewedAt: new Date(),
      financeComments: comments,
      financeApprovedBudgetSar: approved ? (approvedBudgetSar ?? null) : null,
      budgetSar: approved && approvedBudgetSar !== undefined ? approvedBudgetSar : undefined,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(rndPlans.id, planId),
        eq(rndPlans.tenantId, tenantId),
        eq(rndPlans.status, "PENDING_FINANCE")
      )
    )
    .returning();
  return updated ?? null;
}

/** Recomputes plan progress from its tasks (or milestones as fallback). */
export async function refreshPlanProgress(tenantId: string, planId: string) {
  const tasks = await db
    .select({ progressPct: rndTasks.progressPct })
    .from(rndTasks)
    .where(and(eq(rndTasks.planId, planId), eq(rndTasks.tenantId, tenantId)));

  let progress = 0;
  if (tasks.length > 0) {
    progress = Math.round(
      tasks.reduce((s, t) => s + (t.progressPct ?? 0), 0) / tasks.length
    );
  } else {
    const milestones = await db
      .select({ progressPct: rndMilestones.progressPct })
      .from(rndMilestones)
      .where(
        and(
          eq(rndMilestones.planId, planId),
          eq(rndMilestones.tenantId, tenantId)
        )
      );
    if (milestones.length > 0) {
      progress = Math.round(
        milestones.reduce((s, m) => s + (m.progressPct ?? 0), 0) / milestones.length
      );
    }
  }

  // Auto-flip APPROVED → IN_PROGRESS on first recorded progress
  const [plan] = await db
    .select({ status: rndPlans.status })
    .from(rndPlans)
    .where(and(eq(rndPlans.id, planId), eq(rndPlans.tenantId, tenantId)))
    .limit(1);

  const patch: Record<string, unknown> = {
    overallProgressPct: progress,
    updatedAt: new Date(),
  };
  if (plan?.status === "APPROVED" && progress > 0) patch.status = "IN_PROGRESS";
  if (progress >= 100 && plan && ["APPROVED", "IN_PROGRESS"].includes(plan.status))
    patch.status = "COMPLETED";

  await db
    .update(rndPlans)
    .set(patch)
    .where(and(eq(rndPlans.id, planId), eq(rndPlans.tenantId, tenantId)));

  return progress;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function listTasks(tenantId: string, planId?: string) {
  const where = planId
    ? and(eq(rndTasks.tenantId, tenantId), eq(rndTasks.planId, planId))
    : eq(rndTasks.tenantId, tenantId);
  return db
    .select()
    .from(rndTasks)
    .where(where)
    .orderBy(desc(rndTasks.createdAt));
}

export async function listMyTasks(tenantId: string, userId: string) {
  return db
    .select()
    .from(rndTasks)
    .where(and(eq(rndTasks.tenantId, tenantId), eq(rndTasks.assigneeId, userId)))
    .orderBy(rndTasks.dueDate);
}

export async function createTask(
  tenantId: string,
  userId: string,
  input: {
    planId?: string;
    milestoneId?: string;
    title: string;
    description?: string;
    assigneeId?: string;
    assigneeName?: string;
    startDate?: string;
    dueDate: string;
    priority?: "HIGH" | "MEDIUM" | "LOW";
    estimatedHours?: number;
  }
) {
  const [task] = await db
    .insert(rndTasks)
    .values({
      tenantId,
      planId: input.planId,
      milestoneId: input.milestoneId,
      title: input.title,
      description: input.description,
      assigneeId: input.assigneeId,
      assigneeName: input.assigneeName,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      dueDate: new Date(input.dueDate),
      priority: input.priority ?? "MEDIUM",
      estimatedHours:
        input.estimatedHours !== undefined ? String(input.estimatedHours) : undefined,
      createdById: userId,
    })
    .returning();

  if (input.planId) await refreshPlanProgress(tenantId, input.planId);
  return task;
}

export async function updateTask(
  tenantId: string,
  taskId: string,
  input: Partial<{
    title: string;
    description: string;
    assigneeId: string;
    assigneeName: string;
    startDate: string;
    dueDate: string;
    status: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "BLOCKED";
    priority: "HIGH" | "MEDIUM" | "LOW";
    progressPct: number;
    estimatedHours: number;
    actualHours: number;
  }>
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId || null;
  if (input.assigneeName !== undefined) patch.assigneeName = input.assigneeName;
  if (input.startDate !== undefined)
    patch.startDate = input.startDate ? new Date(input.startDate) : null;
  if (input.dueDate !== undefined) patch.dueDate = new Date(input.dueDate);
  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.status === "IN_PROGRESS" && patch.actualStartDate === undefined) {
      // stamp actual start lazily via SQL only when not already set
      patch.actualStartDate = sql`COALESCE(${rndTasks.actualStartDate}, NOW())`;
    }
    if (input.status === "DONE") {
      patch.progressPct = 100;
      patch.actualEndDate = sql`COALESCE(${rndTasks.actualEndDate}, NOW())`;
    }
  }
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.progressPct !== undefined)
    patch.progressPct = Math.min(100, Math.max(0, input.progressPct));
  if (input.estimatedHours !== undefined)
    patch.estimatedHours = String(input.estimatedHours);
  if (input.actualHours !== undefined) patch.actualHours = String(input.actualHours);

  const [updated] = await db
    .update(rndTasks)
    .set(patch)
    .where(and(eq(rndTasks.id, taskId), eq(rndTasks.tenantId, tenantId)))
    .returning();

  if (updated?.planId) await refreshPlanProgress(tenantId, updated.planId);
  return updated ?? null;
}

export async function deleteTask(tenantId: string, taskId: string) {
  const rows = await db
    .select({ planId: rndTasks.planId })
    .from(rndTasks)
    .where(and(eq(rndTasks.id, taskId), eq(rndTasks.tenantId, tenantId)))
    .limit(1);
  await db
    .delete(rndTasks)
    .where(and(eq(rndTasks.id, taskId), eq(rndTasks.tenantId, tenantId)));
  if (rows[0]?.planId) await refreshPlanProgress(tenantId, rows[0].planId);
  return true;
}

export async function addTaskComment(
  tenantId: string,
  taskId: string,
  userId: string,
  content: string
) {
  // Ensure the task belongs to this tenant before accepting the comment
  const task = await db
    .select({ id: rndTasks.id })
    .from(rndTasks)
    .where(and(eq(rndTasks.id, taskId), eq(rndTasks.tenantId, tenantId)))
    .limit(1);
  if (!task[0]) return null;

  const [comment] = await db
    .insert(rndTaskComments)
    .values({ tenantId, taskId, userId, content })
    .returning();
  return comment;
}

export async function listTaskComments(tenantId: string, taskId: string) {
  return db
    .select({
      id: rndTaskComments.id,
      content: rndTaskComments.content,
      createdAt: rndTaskComments.createdAt,
      userId: rndTaskComments.userId,
      userName: users.fullName,
    })
    .from(rndTaskComments)
    .innerJoin(users, eq(rndTaskComments.userId, users.id))
    .where(
      and(
        eq(rndTaskComments.taskId, taskId),
        eq(rndTaskComments.tenantId, tenantId)
      )
    )
    .orderBy(rndTaskComments.createdAt);
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export async function listBudgetPlans(tenantId: string, planId?: string) {
  const where = planId
    ? and(eq(rndBudgetPlans.tenantId, tenantId), eq(rndBudgetPlans.planId, planId))
    : eq(rndBudgetPlans.tenantId, tenantId);
  const plans = await db
    .select()
    .from(rndBudgetPlans)
    .where(where)
    .orderBy(desc(rndBudgetPlans.createdAt));

  const withItems = await Promise.all(
    plans.map(async (b) => ({
      ...b,
      items: await db
        .select()
        .from(rndBudgetItems)
        .where(
          and(
            eq(rndBudgetItems.budgetPlanId, b.id),
            eq(rndBudgetItems.tenantId, tenantId)
          )
        )
        .orderBy(rndBudgetItems.createdAt),
    }))
  );
  return withItems;
}

export async function createBudgetPlan(
  tenantId: string,
  userId: string,
  input: { planId?: string; fiscalYear?: string; totalBudgetSar?: number }
) {
  const [created] = await db
    .insert(rndBudgetPlans)
    .values({
      tenantId,
      planId: input.planId,
      fiscalYear: input.fiscalYear ?? String(new Date().getFullYear()),
      totalBudgetSar: input.totalBudgetSar ?? 0,
      createdById: userId,
    })
    .returning();
  return created;
}

export async function addBudgetItem(
  tenantId: string,
  userId: string,
  budgetPlanId: string,
  input: {
    name: string;
    description?: string;
    category?: "EQUIPMENT" | "SOFTWARE" | "TRAINING" | "CONSULTING" | "MARKETING" | "HR" | "MATERIALS" | "OTHER";
    estimatedCostSar?: number;
    vendor?: string;
  }
) {
  const budget = await db
    .select({ id: rndBudgetPlans.id, allocated: rndBudgetPlans.allocatedBudgetSar })
    .from(rndBudgetPlans)
    .where(
      and(eq(rndBudgetPlans.id, budgetPlanId), eq(rndBudgetPlans.tenantId, tenantId))
    )
    .limit(1);
  if (!budget[0]) return null;

  const [item] = await db
    .insert(rndBudgetItems)
    .values({
      tenantId,
      budgetPlanId,
      name: input.name,
      description: input.description,
      category: input.category ?? "OTHER",
      estimatedCostSar: input.estimatedCostSar ?? 0,
      vendor: input.vendor,
      createdById: userId,
    })
    .returning();

  await db
    .update(rndBudgetPlans)
    .set({
      allocatedBudgetSar: (budget[0].allocated ?? 0) + (input.estimatedCostSar ?? 0),
      updatedAt: new Date(),
    })
    .where(eq(rndBudgetPlans.id, budgetPlanId));

  return item;
}

export async function decideBudgetItem(
  tenantId: string,
  itemId: string,
  financeUserId: string,
  approved: boolean
) {
  const [updated] = await db
    .update(rndBudgetItems)
    .set({
      status: approved ? "APPROVED" : "CANCELLED",
      financeReviewedById: financeUserId,
      financeReviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(eq(rndBudgetItems.id, itemId), eq(rndBudgetItems.tenantId, tenantId))
    )
    .returning();
  return updated ?? null;
}

// ─── Weekly Tracking ──────────────────────────────────────────────────────────

export async function listWeeklyEntries(tenantId: string, planId: string) {
  return db
    .select()
    .from(rndWeeklyEntries)
    .where(
      and(eq(rndWeeklyEntries.planId, planId), eq(rndWeeklyEntries.tenantId, tenantId))
    )
    .orderBy(desc(rndWeeklyEntries.year), desc(rndWeeklyEntries.weekNumber));
}

export async function createWeeklyEntry(
  tenantId: string,
  userId: string,
  input: {
    planId: string;
    weekNumber: number;
    year: number;
    weekStartDate: string;
    weekEndDate: string;
    plannedTarget: number;
    actualAchieved: number;
    blockers?: string;
    actionsTaken?: string;
    nextWeekPlan?: string;
    metricsSnapshot?: Record<string, number>;
  }
) {
  // Verify plan ownership first
  const plan = await db
    .select({ id: rndPlans.id })
    .from(rndPlans)
    .where(and(eq(rndPlans.id, input.planId), eq(rndPlans.tenantId, tenantId)))
    .limit(1);
  if (!plan[0]) return null;

  const variance =
    input.plannedTarget > 0
      ? ((input.actualAchieved - input.plannedTarget) / input.plannedTarget) * 100
      : 0;

  const [entry] = await db
    .insert(rndWeeklyEntries)
    .values({
      tenantId,
      planId: input.planId,
      weekNumber: input.weekNumber,
      year: input.year,
      weekStartDate: new Date(input.weekStartDate),
      weekEndDate: new Date(input.weekEndDate),
      plannedTarget: String(input.plannedTarget),
      actualAchieved: String(input.actualAchieved),
      variancePct: variance.toFixed(2),
      isOnTrack: variance >= -10,
      blockers: input.blockers,
      actionsTaken: input.actionsTaken,
      nextWeekPlan: input.nextWeekPlan,
      metricsSnapshot: input.metricsSnapshot ?? {},
      submittedById: userId,
    })
    .returning();

  await refreshPlanProgress(tenantId, input.planId);
  return entry;
}

// ─── External Issues ──────────────────────────────────────────────────────────

export async function listExternalIssues(tenantId: string, status?: string) {
  const where = status
    ? and(
        eq(rndExternalIssues.tenantId, tenantId),
        eq(rndExternalIssues.status, status as "OPEN")
      )
    : eq(rndExternalIssues.tenantId, tenantId);
  return db
    .select()
    .from(rndExternalIssues)
    .where(where)
    .orderBy(desc(rndExternalIssues.createdAt));
}

export async function createExternalIssue(
  tenantId: string,
  userId: string,
  userName: string,
  input: {
    title: string;
    description?: string;
    severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    category?: "EQUIPMENT" | "QUALITY" | "SAFETY" | "STAFF" | "SUPPLIER" | "OTHER";
    assignedToId?: string;
    assignedToName?: string;
  }
) {
  const [issue] = await db
    .insert(rndExternalIssues)
    .values({
      tenantId,
      title: input.title,
      description: input.description,
      severity: input.severity ?? "MEDIUM",
      category: input.category ?? "OTHER",
      reportedById: userId,
      reportedByName: userName,
      assignedToId: input.assignedToId,
      assignedToName: input.assignedToName,
    })
    .returning();
  return issue;
}

export async function updateExternalIssue(
  tenantId: string,
  issueId: string,
  userId: string,
  input: Partial<{
    title: string;
    description: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    category: "EQUIPMENT" | "QUALITY" | "SAFETY" | "STAFF" | "SUPPLIER" | "OTHER";
    assignedToId: string;
    assignedToName: string;
    status: "OPEN" | "INVESTIGATING" | "RESOLVING" | "RESOLVED" | "CLOSED";
    rootCause: string;
    resolution: string;
    relatedPlanId: string;
    relatedTaskId: string;
  }>
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.severity !== undefined) patch.severity = input.severity;
  if (input.category !== undefined) patch.category = input.category;
  if (input.assignedToId !== undefined)
    patch.assignedToId = input.assignedToId || null;
  if (input.assignedToName !== undefined) patch.assignedToName = input.assignedToName;
  if (input.status !== undefined) {
    patch.status = input.status;
    if (["RESOLVED", "CLOSED"].includes(input.status)) {
      patch.resolvedAt = sql`COALESCE(${rndExternalIssues.resolvedAt}, NOW())`;
      patch.resolvedById = userId;
    }
  }
  if (input.rootCause !== undefined) patch.rootCause = input.rootCause;
  if (input.resolution !== undefined) patch.resolution = input.resolution;
  if (input.relatedPlanId !== undefined)
    patch.relatedPlanId = input.relatedPlanId || null;
  if (input.relatedTaskId !== undefined)
    patch.relatedTaskId = input.relatedTaskId || null;

  const [updated] = await db
    .update(rndExternalIssues)
    .set(patch)
    .where(
      and(eq(rndExternalIssues.id, issueId), eq(rndExternalIssues.tenantId, tenantId))
    )
    .returning();
  return updated ?? null;
}

export async function addIssueComment(
  tenantId: string,
  issueId: string,
  userId: string,
  content: string
) {
  const issue = await db
    .select({ id: rndExternalIssues.id })
    .from(rndExternalIssues)
    .where(
      and(eq(rndExternalIssues.id, issueId), eq(rndExternalIssues.tenantId, tenantId))
    )
    .limit(1);
  if (!issue[0]) return null;

  const [comment] = await db
    .insert(rndIssueComments)
    .values({ tenantId, issueId, userId, content })
    .returning();
  return comment;
}

// ─── Evaluations ──────────────────────────────────────────────────────────────

export async function listEvaluations(tenantId: string) {
  return db
    .select()
    .from(rndEvaluations)
    .where(eq(rndEvaluations.tenantId, tenantId))
    .orderBy(desc(rndEvaluations.createdAt));
}

export async function createEvaluation(
  tenantId: string,
  userId: string,
  userName: string,
  input: {
    employeeId?: string;
    employeeName: string;
    periodStart: string;
    periodEnd: string;
    tasksAssigned?: number;
    tasksCompleted?: number;
    qualityScore: number;
    initiativeScore: number;
    teamworkScore: number;
    strengths?: string;
    improvements?: string;
    reviewerComments?: string;
  }
) {
  const assigned = input.tasksAssigned ?? 0;
  const completed = input.tasksCompleted ?? 0;
  const clamp = (n: number) => Math.min(10, Math.max(0, Math.round(n)));
  const overall =
    Math.round(((clamp(input.qualityScore) + clamp(input.initiativeScore) + clamp(input.teamworkScore)) / 3) * 100) /
    100;

  const [ev] = await db
    .insert(rndEvaluations)
    .values({
      tenantId,
      employeeId: input.employeeId,
      employeeName: input.employeeName,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      tasksAssigned: assigned,
      tasksCompleted: completed,
      completionRatePct: assigned > 0 ? Math.round((completed / assigned) * 100) : 0,
      qualityScore: clamp(input.qualityScore),
      initiativeScore: clamp(input.initiativeScore),
      teamworkScore: clamp(input.teamworkScore),
      overallScore: String(overall),
      strengths: input.strengths,
      improvements: input.improvements,
      reviewerComments: input.reviewerComments,
      evaluatedById: userId,
      evaluatedByName: userName,
    })
    .returning();
  return ev;
}
