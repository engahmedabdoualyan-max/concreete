/**
 * Authentication Store
 * Manages user session, role-based routing, and auth state
 */

import { create } from "zustand";
import { api } from "@/lib/api";
import type { AuthUser, UserRole } from "@/types";

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
      set({ user: auth.user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({
        error: "بيانات الدخول غير صحيحة",
        isLoading: false,
        isAuthenticated: false,
      });
      throw error;
    }
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
      const user = await api.getCurrentUser();
      if (user) {
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
 * The ERP exposes 10 roles in total:
 *   • 4 PRIMARY (mobile-facing): SUPER_ADMIN · FINANCE · SALES_REP · DRIVER
 *   • 6 SUPPORTING sub-roles: DISPATCHER · BATCH_OPERATOR · LAB_TECH ·
 *     WORKSHOP_MGR · WORKSHOP_MECHANIC · LAB_TECHNICIAN
 *
 * Mobile routing only distinguishes between the DRIVER view and the
 * SALES_REP view. All other roles are routed through the web dashboard.
 * SUPER_ADMIN falls through to the driver view on mobile for field
 * visibility (they can override via the web app).
 */
export function isDriver(user: AuthUser | null): boolean {
  if (!user) return false;
  // SUB-ROLES that share the driver field workflow:
  //   DRIVER · WORKSHOP_MGR (also operates vehicles on the road)
  //   SUPER_ADMIN (field override mode on mobile)
  return user.role === "DRIVER" || user.role === "WORKSHOP_MGR" || user.role === "SUPER_ADMIN";
}

export function isSalesRep(user: AuthUser | null): boolean {
  if (!user) return false;
  // SUB-ROLES that share the sales field workflow:
  //   SALES_REP · FINANCE (also manages client pipelines on the road)
  return user.role === "SALES_REP" || user.role === "FINANCE";
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
