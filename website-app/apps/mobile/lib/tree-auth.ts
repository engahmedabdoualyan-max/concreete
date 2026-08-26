/**
 * Tree Account Login (offline-backend fallback)
 * ============================================================
 * The production ERP API (concrete.fimtosoft.com/api) is not always
 * reachable (dev/staging or not-yet-deployed backend). As a fallback the
 * app can authenticate against the **app-tree accounts** created by the
 * owner in the website admin console (Firestore `companyTrees`).
 *
 * Firestore rules are public-read, so this uses the plain REST API via
 * `fetch` — no extra native dependencies and no Firebase SDK needed.
 */

import type { AuthUser, UserRole } from "@/types";
import { authHeaders } from "./fb-auth";
import { hashPassword } from "./pw";

const FIREBASE_PROJECT = "concrete-erb";
const FIREBASE_API_KEY = "AIzaSyBbK2e2saN8Olu7O6vjHP23MkTsUgyN2iE";

const FIRESTORE_LIST =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}` +
  `/databases/%28default%29/documents/companyTrees?key=${FIREBASE_API_KEY}&pageSize=300`;

export interface TreeAccount {
  email: string;
  password: string;
  role: string;
  roleAr: string;
  permissions: string[];
  mods: string[];
  phone?: string;
  truck?: string;
  gps?: string;
}

export interface TreeAccountResult {
  companyUsername: string;
  account: TreeAccount;
  /** Company subscription (from companyTrees doc) — set by the owner in Console. */
  subscriptionStart?: string;
  subscriptionEnd?: string;
  subscriptionStatus?: string;
}

// Map the website app-tree roles to the mobile app's ERP roles.
const TREE_ROLE_MAP: Record<string, UserRole> = {
  sysadmin: "SUPER_ADMIN",
  ptown: "SUPER_ADMIN",
  driver: "DRIVER",
  sales: "SALES_REP",
  accountant: "FINANCE",
  scheduleMgr: "SCHEDULE_MGR",
  opsMgr: "OPERATIONS_MGR",
  prodMgr: "PRODUCTION_MGR",
  repsMgr: "REPS_MGR",
  storekeeper: "SUPER_ADMIN",
  workshopMgr: "WORKSHOP_MGR",
  mechanic: "WORKSHOP_MECHANIC",
  stationTech: "STATION_TECH",
  batchOp: "BATCH_OPERATOR",
  labMgr: "LAB_TECH",
  labTech: "LAB_TECHNICIAN",
};

// Default module access per tree role (mirrors website treeRoles.ts TREE_ROLES mods).
// Used as a fallback when the stored account has no explicit `mods` list.
const TREE_ROLE_MODS: Record<string, string[]> = {
  sysadmin: ["operations", "production", "workshop", "mixing", "schedule", "orders", "evaluation", "rnd"],
  ptown: ["operations", "production", "workshop", "mixing", "schedule", "orders", "evaluation", "rnd"],
  driver: ["operations", "orders"],
  sales: ["orders", "operations"],
  accountant: ["orders", "evaluation"],
  scheduleMgr: ["schedule", "orders"],
  opsMgr: ["operations", "schedule", "orders"],
  prodMgr: ["production", "mixing", "workshop"],
  repsMgr: ["orders"],
  storekeeper: ["production", "orders"],
  workshopMgr: ["workshop", "production"],
  mechanic: ["workshop"],
  stationTech: ["workshop", "mixing"],
  batchOp: ["production", "mixing"],
  labMgr: ["mixing", "evaluation", "rnd"],
  labTech: ["mixing", "evaluation", "rnd"],
};

function str(v: unknown): string {
  if (v && typeof v === "object" && "stringValue" in v) {
    return typeof v.stringValue === "string" ? v.stringValue : "";
  }
  return "";
}

function mapAccount(fields: any): TreeAccount {
  return {
    email: str(fields.email),
    password: str(fields.password),
    role: str(fields.role),
    roleAr: str(fields.roleAr),
    phone: str(fields.phone),
    truck: str(fields.truck),
    gps: str(fields.gps),
    permissions: Array.isArray(fields.permissions?.arrayValue?.values)
      ? fields.permissions.arrayValue.values.map((v: any) => str(v))
      : [],
    mods: Array.isArray(fields.mods?.arrayValue?.values)
      ? fields.mods.arrayValue.values.map((v: any) => str(v))
      : [],
  };
}

/** Fetch every company tree and find an account matching phone+password. */
export async function findTreeAccount(
  phone: string,
  password: string
): Promise<TreeAccountResult | null> {
  const p = (phone || "").trim().toLowerCase();
  const pw = password || "";
  if (!p || !pw) return null;

  try {
    const res = await fetch(FIRESTORE_LIST, { headers: await authHeaders() });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const docs: any[] = json?.documents ?? [];
    for (const doc of docs) {
      const fields = doc?.fields ?? {};
      const companyUsername = str(fields.companyUsername);
      const accounts = fields.accounts?.arrayValue?.values ?? [];
      for (const entry of accounts) {
        const account = mapAccount(entry?.mapValue?.fields ?? {});
        const id = (account.email || "").toLowerCase();
        const phoneMatch = (account.phone || "").toLowerCase() === p;
        if (id === p || phoneMatch) {
          // Progressive: hashed accounts first, legacy plaintext second
          const identifier = account.email || account.phone || "";
          const hashMatch =
            !!(account as any).passwordHash &&
            (account as any).passwordHash === hashPassword(identifier, pw);
          const legacyMatch = account.password === pw;
          if (hashMatch || legacyMatch) {
            return {
              companyUsername,
              account,
              subscriptionStart: str(fields.subscriptionStart),
              subscriptionEnd: str(fields.subscriptionEnd),
              subscriptionStatus: str(fields.subscriptionStatus),
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn("[TreeAuth] lookup failed", err);
  }
  return null;
}

export function treeAccountToUser(result: TreeAccountResult): AuthUser {
  const { companyUsername, account } = result;
  const role = TREE_ROLE_MAP[account.role] ?? "DRIVER";
  return {
    id: `tree-${companyUsername}`,
    employeeCode: account.truck || account.email || account.roleAr,
    fullName: account.roleAr || account.email || companyUsername,
    email: account.email || "",
    role,
    zone: companyUsername,
    mods: account.mods?.length
      ? [...account.mods]
      : [...(TREE_ROLE_MODS[account.role] ?? [])],
    vehicleType: account.truck || "",
    subscriptionStart: result.subscriptionStart,
    subscriptionEnd: result.subscriptionEnd,
    subscriptionStatus: result.subscriptionStatus,
    plantName: companyUsername,
  };
}

/** True when the company's subscription is set and has ended. */
export function isSubscriptionExpired(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.subscriptionStatus === "expired") return true;
  if (!user.subscriptionEnd) return false;
  const end = new Date(user.subscriptionEnd);
  if (isNaN(end.getTime())) return false;
  return end < new Date();
}
