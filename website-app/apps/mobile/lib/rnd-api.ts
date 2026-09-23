/**
 * R&D API Client for Fimto Concrete ERP Mobile App
 * Handles all R&D module endpoints
 */

import { api } from "@/lib/api";
import type {
  CurrentState,
  DevelopmentPlan,
  RnDTask,
  BudgetPlan,
  WeeklyTracking,
  ExternalIssue,
  EmployeeEvaluation,
  RndDashboardData,
  Competitor,
  CompetitorProduct,
  PriceComparison,
} from "@/types/rnd";

export class RndApi {
  // ─── Dashboard ──────────────────────────────────────────────────────────

  async getDashboard(): Promise<RndDashboardData> {
    // Will be implemented when backend is ready
    // For now returns empty structure
    throw new Error("R&D Backend not yet implemented");
  }

  // ─── Current State ──────────────────────────────────────────────────────

  async getCurrentState(): Promise<CurrentState | null> {
    try {
      const response = await (api as any).client.get("/rnd/current-state");
      return response.data.data;
    } catch {
      return null;
    }
  }

  async saveCurrentState(data: Partial<CurrentState>): Promise<CurrentState> {
    const response = await (api as any).client.post("/rnd/current-state", data);
    return response.data.data;
  }

  // ─── Development Plans ──────────────────────────────────────────────────

  async getPlans(): Promise<DevelopmentPlan[]> {
    try {
      const response = await (api as any).client.get("/rnd/plans");
      return response.data.data?.plans ?? [];
    } catch {
      return [];
    }
  }

  async getPlanById(planId: string): Promise<DevelopmentPlan> {
    const response = await (api as any).client.get(`/rnd/plans/${planId}`);
    return response.data.data;
  }

  async createPlan(data: Partial<DevelopmentPlan>): Promise<DevelopmentPlan> {
    const response = await (api as any).client.post("/rnd/plans", data);
    return response.data.data;
  }

  async updatePlan(
    planId: string,
    data: Partial<DevelopmentPlan>
  ): Promise<DevelopmentPlan> {
    const response = await (api as any).client.put(`/rnd/plans/${planId}`, data);
    return response.data.data;
  }

  async submitForFinanceApproval(planId: string): Promise<DevelopmentPlan> {
    const response = await (api as any).client.post(
      `/rnd/plans/${planId}/submit-finance`
    );
    return response.data.data;
  }

  async approvePlan(
    planId: string,
    approved: boolean,
    comments?: string,
    approvedBudget?: number
  ): Promise<DevelopmentPlan> {
    const response = await (api as any).client.post(
      `/rnd/plans/${planId}/finance-decision`,
      { approved, comments, approvedBudget }
    );
    return response.data.data;
  }

  async deletePlan(planId: string): Promise<void> {
    await (api as any).client.delete(`/rnd/plans/${planId}`);
  }

  // ─── Tasks ──────────────────────────────────────────────────────────────

  async getTasks(planId?: string): Promise<RnDTask[]> {
    try {
      const url = planId
        ? `/rnd/tasks?planId=${planId}`
        : "/rnd/tasks";
      const response = await (api as any).client.get(url);
      return response.data.data?.tasks ?? [];
    } catch {
      return [];
    }
  }

  async getMyTasks(): Promise<RnDTask[]> {
    try {
      const response = await (api as any).client.get("/rnd/tasks/my");
      return response.data.data?.tasks ?? [];
    } catch {
      return [];
    }
  }

  async createTask(data: Partial<RnDTask>): Promise<RnDTask> {
    const response = await (api as any).client.post("/rnd/tasks", data);
    return response.data.data;
  }

  async updateTask(
    taskId: string,
    data: Partial<RnDTask>
  ): Promise<RnDTask> {
    const response = await (api as any).client.put(`/rnd/tasks/${taskId}`, data);
    return response.data.data;
  }

  async updateTaskProgress(
    taskId: string,
    progress: number,
    status?: string
  ): Promise<RnDTask> {
    const response = await (api as any).client.post(
      `/rnd/tasks/${taskId}/progress`,
      { progress, status }
    );
    return response.data.data;
  }

  async addTaskComment(
    taskId: string,
    content: string
  ): Promise<void> {
    await (api as any).client.post(`/rnd/tasks/${taskId}/comments`, {
      content,
    });
  }

  async deleteTask(taskId: string): Promise<void> {
    await (api as any).client.delete(`/rnd/tasks/${taskId}`);
  }

  // ─── Budget ─────────────────────────────────────────────────────────────

  async getBudgetPlans(planId?: string): Promise<BudgetPlan[]> {
    try {
      const url = planId
        ? `/rnd/budgets?planId=${planId}`
        : "/rnd/budgets";
      const response = await (api as any).client.get(url);
      return response.data.data?.budgets ?? [];
    } catch {
      return [];
    }
  }

  async createBudgetPlan(data: Partial<BudgetPlan>): Promise<BudgetPlan> {
    const response = await (api as any).client.post("/rnd/budgets", data);
    return response.data.data;
  }

  async updateBudgetPlan(
    budgetId: string,
    data: Partial<BudgetPlan>
  ): Promise<BudgetPlan> {
    const response = await (api as any).client.put(
      `/rnd/budgets/${budgetId}`,
      data
    );
    return response.data.data;
  }

  // ─── Weekly Tracking ────────────────────────────────────────────────────

  async getWeeklyEntries(planId: string): Promise<WeeklyTracking[]> {
    try {
      const response = await (api as any).client.get(
        `/rnd/plans/${planId}/weekly`
      );
      return response.data.data?.entries ?? [];
    } catch {
      return [];
    }
  }

  async createWeeklyEntry(
    data: Partial<WeeklyTracking>
  ): Promise<WeeklyTracking> {
    const response = await (api as any).client.post("/rnd/weekly", data);
    return response.data.data;
  }

  // ─── External Issues ────────────────────────────────────────────────────

  async getExternalIssues(): Promise<ExternalIssue[]> {
    try {
      const response = await (api as any).client.get("/rnd/issues");
      return response.data.data?.issues ?? [];
    } catch {
      return [];
    }
  }

  async createExternalIssue(
    data: Partial<ExternalIssue>
  ): Promise<ExternalIssue> {
    const response = await (api as any).client.post("/rnd/issues", data);
    return response.data.data;
  }

  async updateExternalIssue(
    issueId: string,
    data: Partial<ExternalIssue>
  ): Promise<ExternalIssue> {
    const response = await (api as any).client.put(
      `/rnd/issues/${issueId}`,
      data
    );
    return response.data.data;
  }

  async addIssueComment(issueId: string, content: string): Promise<void> {
    await (api as any).client.post(`/rnd/issues/${issueId}/comments`, {
      content,
    });
  }

  // ─── Employee Evaluations ───────────────────────────────────────────────

  async getEvaluations(): Promise<EmployeeEvaluation[]> {
    try {
      const response = await (api as any).client.get("/rnd/evaluations");
      return response.data.data?.evaluations ?? [];
    } catch {
      return [];
    }
  }

  async createEvaluation(
    data: Partial<EmployeeEvaluation>
  ): Promise<EmployeeEvaluation> {
    const response = await (api as any).client.post("/rnd/evaluations", data);
    return response.data.data;
  }

  // ─── Competitor Intelligence (المصانع المنافسة) ────────────────────────

  async getCompetitors(): Promise<Competitor[]> {
    try {
      const response = await (api as any).client.get("/rnd/competitors");
      return response.data.data?.competitors ?? [];
    } catch {
      return [];
    }
  }

  async createCompetitor(data: Partial<Competitor>): Promise<Competitor> {
    const response = await (api as any).client.post("/rnd/competitors", data);
    return response.data.data;
  }

  async deleteCompetitor(competitorId: string): Promise<void> {
    await (api as any).client.delete(`/rnd/competitors/${competitorId}`);
  }

  async getCompetitorProducts(competitorId: string): Promise<CompetitorProduct[]> {
    try {
      const response = await (api as any).client.get(
        `/rnd/competitors/${competitorId}/products`
      );
      return response.data.data?.products ?? [];
    } catch {
      return [];
    }
  }

  async createCompetitorProduct(
    competitorId: string,
    data: Partial<CompetitorProduct>
  ): Promise<CompetitorProduct> {
    const response = await (api as any).client.post(
      `/rnd/competitors/${competitorId}/products`,
      data
    );
    return response.data.data;
  }

  async deleteCompetitorProduct(productId: string): Promise<void> {
    await (api as any).client.delete(`/rnd/products/${productId}`);
  }

  async getPriceComparison(grade?: string): Promise<PriceComparison | null> {
    try {
      const url = grade
        ? `/rnd/comparison?grade=${encodeURIComponent(grade)}`
        : "/rnd/comparison";
      const response = await (api as any).client.get(url);
      return response.data.data;
    } catch {
      return null;
    }
  }

  // ─── Users (for assignment dropdowns) ──────────────────────────────────

  async getTeamMembers(): Promise<
    Array<{ id: string; fullName: string; role: string; employeeCode: string }>
  > {
    try {
      const response = await (api as any).client.get("/users");
      const users = response.data.data?.users ?? response.data.data ?? [];
      return users.map((u: any) => ({
        id: u.id,
        fullName: u.fullName ?? u.full_name ?? u.name,
        role: u.role,
        employeeCode: u.employeeCode ?? u.employee_code,
      }));
    } catch {
      return [];
    }
  }
}

export const rndApi = new RndApi();
