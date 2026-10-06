import { createHash } from "node:crypto";

/**
 * ============================================================
 *  tree-admin.service — server-side access to the Firestore
 *  companyTrees login accounts (Android app logins)
 * ============================================================
 *  WHY A PROXY: production Firestore rules deny every browser read of
 *  companyTrees/users (those docs carry password hashes). The website
 *  and desktop builds also ship with anonymous Firebase auth disabled
 *  in PROD, so direct reads fail with "Missing or insufficient
 *  permissions". This service uses Firebase Admin (service account),
 *  so HR managers keep working through RBAC-gated API routes while the
 *  rules stay locked. Passwords are hashed server-side with the same
 *  SHA-256(`${id}::${pw}::fimto-pw-salt-v1`) scheme the Console and the
 *  mobile app verify — plaintext never lands in Firestore, and hashes
 *  never leave this service (list responses strip them).
 *
 *  Requires env FIREBASE_SERVICE_ACCOUNT_JSON. Without it every call
 *  throws FIREBASE_NOT_CONFIGURED and the UI says so honestly.
 */

const SALT = "fimto-pw-salt-v1";

export interface TreeAccountView {
  email: string;
  phone: string;
  role: string;
  roleAr: string;
  permissions: string[];
  mods: string[];
  truck: string;
  gps: string;
  employeeId?: string | null;
}

let adminChecked: boolean | null = null;
let firestoreDb: unknown = null;

async function adminDb(): Promise<any> {
  if (firestoreDb) return firestoreDb;
  if (adminChecked === false) {
    throw new Error("FIREBASE_NOT_CONFIGURED");
  }
  try {
    const serviceJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceJson) {
      adminChecked = false;
      throw new Error("FIREBASE_NOT_CONFIGURED");
    }
    const admin = (await import("firebase-admin")) as typeof import("firebase-admin");
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceJson) as never),
      });
    }
    firestoreDb = admin.firestore();
    adminChecked = true;
    return firestoreDb;
  } catch (e) {
    if ((e as Error)?.message === "FIREBASE_NOT_CONFIGURED") throw e;
    adminChecked = false;
    throw new Error("FIREBASE_NOT_CONFIGURED");
  }
}

export function hashTreePassword(loginId: string, password: string): string {
  return createHash("sha256")
    .update(`${loginId.trim().toLowerCase()}::${password}::${SALT}`)
    .digest("hex");
}

function toView(a: Record<string, unknown>): TreeAccountView {
  return {
    email: String(a.email ?? ""),
    phone: String(a.phone ?? ""),
    role: String(a.role ?? ""),
    roleAr: String(a.roleAr ?? ""),
    permissions: Array.isArray(a.permissions) ? (a.permissions as string[]) : [],
    mods: Array.isArray(a.mods) ? (a.mods as string[]) : [],
    truck: String(a.truck ?? ""),
    gps: String(a.gps ?? ""),
    employeeId: (a.employeeId as string) ?? null,
  };
}

export async function getTreeAccounts(companyUsername: string): Promise<TreeAccountView[]> {
  const db = await adminDb();
  const snap = await db.collection("companyTrees").doc(companyUsername.trim().toLowerCase()).get();
  if (!snap.exists) return [];
  const accounts = (snap.data()?.accounts ?? []) as Record<string, unknown>[];
  return (Array.isArray(accounts) ? accounts : []).map(toView);
}

export interface SaveTreeAccountInput {
  email: string;
  phone?: string;
  role: string;
  roleAr?: string;
  permissions?: string[];
  mods?: string[];
  truck?: string;
  gps?: string;
  employeeId?: string | null;
  /** Plaintext only in transit — hashed here, never stored. Empty = keep existing hash. */
  password?: string;
}

export async function saveTreeAccount(
  companyUsername: string,
  input: SaveTreeAccountInput
): Promise<TreeAccountView> {
  const db = await adminDb();
  const company = companyUsername.trim().toLowerCase();
  const loginId = (input.email || input.phone || "").trim().toLowerCase();
  if (!company || !loginId || !input.role) {
    throw new Error("VALIDATION_ERROR");
  }

  const ref = db.collection("companyTrees").doc(company);
  const snap = await ref.get();
  const accounts = (snap.exists ? ((snap.data()?.accounts ?? []) as Record<string, unknown>[]) : []).filter(
    (a) => String(a.email ?? a.phone ?? "").toLowerCase() !== loginId
  );

  const prev = (snap.exists ? ((snap.data()?.accounts ?? []) as Record<string, unknown>[]) : []).find(
    (a) => String(a.email ?? a.phone ?? "").toLowerCase() === loginId
  );
  const passwordHash =
    input.password && input.password.trim() !== ""
      ? hashTreePassword(loginId, input.password.trim())
      : String(prev?.passwordHash ?? "");

  const record: Record<string, unknown> = {
    email: input.email.trim().toLowerCase() || loginId,
    phone: (input.phone ?? "").trim(),
    role: input.role,
    roleAr: input.roleAr ?? input.role,
    permissions: input.permissions ?? [],
    mods: input.mods ?? [],
    truck: input.truck ?? (prev?.truck as string) ?? "",
    gps: input.gps ?? (prev?.gps as string) ?? "",
    employeeId: input.employeeId ?? (prev?.employeeId as string) ?? null,
    password: "",
    passwordHash,
  };
  accounts.push(record);
  await ref.set(
    { companyUsername: company, accounts, updatedAt: new Date() },
    { merge: true }
  );

  // Mirror into the shared users collection so mobile/web login keeps working
  // (same shape Console writes via saveAppAccount).
  await db
    .collection("users")
    .doc(loginId)
    .set(
      {
        username: loginId,
        password: "",
        passwordHash,
        plantName: company,
        phone: record.phone,
        email: record.email,
        status: "APP_ACCOUNT",
        role: record.role,
        roleAr: record.roleAr,
        permissions: record.permissions,
        mods: record.mods,
        updatedAt: new Date(),
      },
      { merge: true }
    );

  return toView(record);
}

export async function deleteTreeAccount(companyUsername: string, login: string): Promise<boolean> {
  const db = await adminDb();
  const company = companyUsername.trim().toLowerCase();
  const loginId = login.trim().toLowerCase();
  const ref = db.collection("companyTrees").doc(company);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const accounts = ((snap.data()?.accounts ?? []) as Record<string, unknown>[]).filter(
    (a) => String(a.email ?? a.phone ?? "").toLowerCase() !== loginId
  );
  await ref.set({ accounts, updatedAt: new Date() }, { merge: true });
  await db.collection("users").doc(loginId).delete().catch(() => {});
  return true;
}
