/**
 * R&D Store (Zustand)
 * Central state for the R&D module with offline-first caching.
 * Server is source of truth; AsyncStorage holds last-known snapshot
 * so field users can keep working without connectivity.
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { rndApi } from "@/lib/rnd-api";
import type {
  CurrentState,
  DevelopmentPlan,
  RnDTask,
  BudgetPlan,
  WeeklyTracking,
  ExternalIssue,
  EmployeeEvaluation,
} from "@/types/rnd";

const CACHE_KEYS = {
  CURRENT_STATE: "rnd_cache_current_state",
  PLANS: "rnd_cache_plans",
  MY_TASKS: "rnd_cache_my_tasks",
  ISSUES: "rnd_cache_issues",
  EVALUATIONS: "rnd_cache_evaluations",
} as const;

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache write failures must never break the UX
  }
}

interface RndState {
  // Data
  currentState: CurrentState | null;
  plans: DevelopmentPlan[];
  myTasks: RnDTask[];
  issues: ExternalIssue[];
  evaluations: EmployeeEvaluation[];

  // UI state
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastSyncedAt: string | null;

  // Actions
  loadCached: () => Promise<void>;
  refreshAll: () => Promise<void>;
  setCurrentState: (s: CurrentState) => void;
  upsertPlan: (p: DevelopmentPlan) => void;
  removePlan: (planId: string) => void;
  upsertTask: (t: RnDTask) => void;
  removeTask: (taskId: string) => void;
  upsertIssue: (i: ExternalIssue) => void;
  clearError: () => void;
}

export const useRndStore = create<RndState>((set, get) => ({
  currentState: null,
  plans: [],
  myTasks: [],
  issues: [],
  evaluations: [],

  isLoading: false,
  isRefreshing: false,
  error: null,
  lastSyncedAt: null,

  loadCached: async () => {
    set({ isLoading: true });
    const [currentState, plans, myTasks, issues, evaluations] =
      await Promise.all([
        readCache<CurrentState>(CACHE_KEYS.CURRENT_STATE),
        readCache<DevelopmentPlan[]>(CACHE_KEYS.PLANS),
        readCache<RnDTask[]>(CACHE_KEYS.MY_TASKS),
        readCache<ExternalIssue[]>(CACHE_KEYS.ISSUES),
        readCache<EmployeeEvaluation[]>(CACHE_KEYS.EVALUATIONS),
      ]);
    set({
      currentState,
      plans: plans ?? [],
      myTasks: myTasks ?? [],
      issues: issues ?? [],
      evaluations: evaluations ?? [],
      isLoading: false,
    });
  },

  refreshAll: async () => {
    set({ isRefreshing: true, error: null });
    try {
      const [currentState, plans, myTasks, issues, evaluations] =
        await Promise.all([
          rndApi.getCurrentState(),
          rndApi.getPlans(),
          rndApi.getMyTasks(),
          rndApi.getExternalIssues(),
          rndApi.getEvaluations(),
        ]);
      set({
        currentState,
        plans,
        myTasks,
        issues,
        evaluations,
        lastSyncedAt: new Date().toISOString(),
        isRefreshing: false,
      });
      await Promise.all([
        writeCache(CACHE_KEYS.CURRENT_STATE, currentState),
        writeCache(CACHE_KEYS.PLANS, plans),
        writeCache(CACHE_KEYS.MY_TASKS, myTasks),
        writeCache(CACHE_KEYS.ISSUES, issues),
        writeCache(CACHE_KEYS.EVALUATIONS, evaluations),
      ]);
    } catch (err) {
      set({
        isRefreshing: false,
        error: err instanceof Error ? err.message : "Sync failed",
      });
    }
  },

  setCurrentState: (s) => {
    set({ currentState: s });
    void writeCache(CACHE_KEYS.CURRENT_STATE, s);
  },

  upsertPlan: (p) => {
    const plans = get().plans;
    const idx = plans.findIndex((x) => x.id === p.id);
    const next =
      idx >= 0 ? plans.map((x, i) => (i === idx ? p : x)) : [p, ...plans];
    set({ plans: next });
    void writeCache(CACHE_KEYS.PLANS, next);
  },

  removePlan: (planId) => {
    const next = get().plans.filter((x) => x.id !== planId);
    set({ plans: next });
    void writeCache(CACHE_KEYS.PLANS, next);
  },

  upsertTask: (t) => {
    const myTasks = get().myTasks;
    const idx = myTasks.findIndex((x) => x.id === t.id);
    const next =
      idx >= 0 ? myTasks.map((x, i) => (i === idx ? t : x)) : [t, ...myTasks];
    set({ myTasks: next });
    void writeCache(CACHE_KEYS.MY_TASKS, next);
  },

  removeTask: (taskId) => {
    const next = get().myTasks.filter((x) => x.id !== taskId);
    set({ myTasks: next });
    void writeCache(CACHE_KEYS.MY_TASKS, next);
  },

  upsertIssue: (i) => {
    const issues = get().issues;
    const idx = issues.findIndex((x) => x.id === i.id);
    const next =
      idx >= 0 ? issues.map((x, j) => (j === idx ? i : x)) : [i, ...issues];
    set({ issues: next });
    void writeCache(CACHE_KEYS.ISSUES, next);
  },

  clearError: () => set({ error: null }),
}));

// ─── Selectors ───────────────────────────────────────────────────────────────

export function selectActivePlans(s: RndState): DevelopmentPlan[] {
  return s.plans.filter(
    (p) => p.status === "approved" || p.status === "in_progress"
  );
}

export function selectPendingFinancePlans(s: RndState): DevelopmentPlan[] {
  return s.plans.filter((p) => p.status === "pending_finance");
}

export function selectOpenIssues(s: RndState): ExternalIssue[] {
  return s.issues.filter(
    (i) => i.status === "open" || i.status === "investigating" || i.status === "resolving"
  );
}

export function selectCriticalIssues(s: RndState): ExternalIssue[] {
  return selectOpenIssues(s).filter((i) => i.severity === "critical");
}

export function selectMyPendingTasks(s: RndState): RnDTask[] {
  return s.myTasks.filter((t) => t.status !== "done");
}

// Re-exported for screens that need the full budget/weekly types
export type { BudgetPlan, WeeklyTracking };
