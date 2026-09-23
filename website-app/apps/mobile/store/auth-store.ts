/**
 * Authentication Store
 * Manages user session, role-based routing, and auth state
 */

import { create } from "zustand";
import { api } from "@/lib/api";
import { setItem, removeItem, STORAGE_KEYS } from "@/lib/storage";
import { findTreeAccount, treeAccountToUser } from "@/lib/tree-auth";
import { erp } from "@/lib/firestore";
import type { AuthUser, UserRole } from "@/types";

/** Merge the company subscription (from companyTrees doc) into the user. */
async function withSubscription(user: AuthUser): Promise<AuthUser> {
  const zone = (user.zone || "").trim().toLowerCase();
  if (!zone) return user;
  try {
    const sub = await erp.loadCompanySubscription(zone);
    if (sub) {
      return {
        ...user,
        subscriptionStart: sub.subscriptionStart || user.subscriptionStart,
        subscriptionEnd: sub.subscriptionEnd || user.subscriptionEnd,
        subscriptionStatus: sub.subscriptionStatus || user.subscriptionStatus,
      };
    }
  } catch {}
  return user;
}

/** Best-effort: enrich the user with the plant display name from the users doc. */
async function withPlantName(user: AuthUser): Promise<AuthUser> {
  if (user.plantName) return user;
  const zone = (user.zone || "").trim().toLowerCase();
  if (!zone) return user;
  try {
    const name = await erp.loadPlantName(zone);
    if (name && name !== zone) return { ...user, plantName: name };
  } catch {}
  return { ...user, plantName: zone };
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (reason?: string) => Promise<void>;
  initialize: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (phone: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const auth = await api.login(phone, password);
      const user = await withPlantName(await withSubscription(auth.user));
      await setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
      // Best-effort push enrolment (Epic 12) — never breaks login
      void import("@/lib/push")
        .then((m) => m.registerForPush())
        .catch(() => {});
    } catch (apiError) {
      // Backend unreachable (or no such server account): fall back to the
      // owner's app-tree accounts (Firestore companyTrees).
      const tree = await findTreeAccount(phone, password);
      if (!tree) {
        set({
          error: "بيانات الدخول غير صحيحة",
          isLoading: false,
          isAuthenticated: false,
        });
        throw apiError;
      }
      const treeUser = await withPlantName(treeAccountToUser(tree));
      // Persist the local session (no server tokens exist for tree accounts).
      await setItem(STORAGE_KEYS.USER, JSON.stringify(treeUser));
      set({ user: treeUser, isAuthenticated: true, isLoading: false });    }
  },

  logout: async () => {
    await api.logout();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  deleteAccount: async (reason?: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteAccount(reason);
      // Account + tokens purged server-side and locally cleared by api layer.
      set({ user: null, isAuthenticated: false, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  initialize: async () => {
    set({ isLoading: true });
    try {
      let user = await api.getCurrentUser();
      if (user) {
        user = await withPlantName(await withSubscription(user));
        if (user) await setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        set({ user, isAuthenticated: true, isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));

// ─── Role-based routing helpers ────────────────────────────────────────────────

/**
 * Mobile routing:
 *   • DRIVER         → native driver field view
 *   • SALES_REP      → native sales field view
 *   • STATION_TECH   → native station maintenance view
 *   • every other role (SUPER_ADMIN / PTown, FINANCE, workshop, lab, batch,
 *     storekeeper, mechanic…) → native ERP dashboard
 */
export function isDriver(user: AuthUser | null): boolean {
  return user?.role === "DRIVER";
}

export function isSalesRep(user: AuthUser | null): boolean {
  return user?.role === "SALES_REP";
}

export function isAccountant(user: AuthUser | null): boolean {
  return user?.role === "FINANCE" || user?.role === "ACCOUNTANT";
}

export function isScheduleMgr(user: AuthUser | null): boolean {
  return user?.role === "SCHEDULE_MGR";
}

export function isDashboardUser(user: AuthUser | null): boolean {
  if (!user) return false;
  return user.role !== "DRIVER" && user.role !== "SALES_REP";
}

export function isCompanyOwner(user: AuthUser | null): boolean {
  return user?.role === "SUPER_ADMIN";
}

export function isRndManager(user: AuthUser | null): boolean {
  if (!user) return false;
  // R&D Manager has access to R&D module on mobile
  return user.role === "RND_MANAGER" || user.role === "SUPER_ADMIN";
}

export function isHrOfficer(user: AuthUser | null): boolean {
  if (!user) return false;
  // HR officers get the HR desk on mobile (requests inbox + broadcasts)
  return user.role === "HR_OFFICER" || user.role === "SUPER_ADMIN";
}

export function isBatchOperator(user: AuthUser | null): boolean {
  return user?.role === "BATCH_OPERATOR";
}

export function isLabTech(user: AuthUser | null): boolean {
  return user?.role === "LAB_TECH" || user?.role === "LAB_TECHNICIAN";
}

export function isWorkshopManager(user: AuthUser | null): boolean {
  return user?.role === "WORKSHOP_MGR";
}

export function isStationTech(user: AuthUser | null): boolean {
  return user?.role === "STATION_TECH";
}

export function isOperationsMgr(user: AuthUser | null): boolean {
  return user?.role === "OPERATIONS_MGR";
}

export function isProductionMgr(user: AuthUser | null): boolean {
  return user?.role === "PRODUCTION_MGR";
}

export function isRepsManager(user: AuthUser | null): boolean {
  return user?.role === "REPS_MGR";
}

export function canAccessFinance(user: AuthUser | null): boolean {
  return user?.role === "FINANCE" || user?.role === "SUPER_ADMIN";
}

export function canAccessDispatch(user: AuthUser | null): boolean {
  if (!user) return false;
  return (
    user.role === "DISPATCHER" ||
    user.role === "SUPER_ADMIN" ||
    user.role === "DRIVER" ||
    user.role === "WORKSHOP_MGR"
  );
}
