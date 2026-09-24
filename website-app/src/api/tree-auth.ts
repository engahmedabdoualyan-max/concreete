import { hashPassword } from "../lib/passwords";
import type { UserSession } from "../context/AuthContext";

/**
 * Tree-account login (same accounts the Android app uses).
 * ============================================================
 * The ERP backend (concrete.fimtosoft.com/api) is not deployed yet, so the
 * website + desktop app authenticate against the Firestore `companyTrees`
 * accounts created by the owner in the Console — identical to the mobile
 * `tree-auth.ts` flow (public-read rules, plain REST, no Firebase SDK).
 *
 * Match: email OR phone (case-insensitive) + plaintext password (legacy)
 * or SHA-256(`${id}::${pw}::fimto-pw-salt-v1`) hex (see lib/passwords).
 */

const FIREBASE_PROJECT = "concrete-erb";
const FIREBASE_API_KEY = "AIzaSyBbK2e2saN8Olu7O6vjHP23MkTsUgyN2iE";

const TREES_URL =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}` +
  `/databases/%28default%29/documents/companyTrees?key=${FIREBASE_API_KEY}&pageSize=300`;

// ─── Anonymous Firebase auth (same as the Android app) ──────────────────────
// companyTrees requires an authenticated read; anonymous sign-up provides a
// throwaway ID token (no user data). Cached + refreshed like mobile fb-auth.
let fbIdToken: string | null = null;
let fbRefreshToken: string | null = null;
let fbExpiresAt = 0;
let fbInflight: Promise<string> | null = null;

async function firebaseToken(): Promise<string> {
  if (fbIdToken && Date.now() < fbExpiresAt) return fbIdToken;
  if (!fbInflight) {
    fbInflight = (async () => {
      try {
        if (fbRefreshToken) {
          const rr = await fetch(
            `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ grant_type: "refresh_token", refresh_token: fbRefreshToken }),
            }
          );
          const rj = (await rr.json().catch(() => null)) as {
            id_token?: string;
            refresh_token?: string;
            expires_in?: string;
          } | null;
          if (rr.ok && rj?.id_token) {
            fbIdToken = rj.id_token;
            fbRefreshToken = rj.refresh_token ?? fbRefreshToken;
            fbExpiresAt = Date.now() + (Number(rj.expires_in) || 3600) * 1000 - 60_000;
            return fbIdToken;
          }
        }
      } catch {
        /* fall through to fresh sign-up */
      }
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ returnSecureToken: true }),
        }
      );
      const json = (await res.json().catch(() => null)) as {
        idToken?: string;
        refreshToken?: string;
        expiresIn?: string;
      } | null;
      if (!res.ok || !json?.idToken) throw new Error("FIREBASE_ANON_AUTH_FAILED");
      fbIdToken = json.idToken;
      fbRefreshToken = json.refreshToken ?? null;
      fbExpiresAt = Date.now() + (Number(json.expiresIn) || 3600) * 1000 - 60_000;
      return fbIdToken;
    })().finally(() => {
      fbInflight = null;
    });
  }
  return fbInflight;
}

export interface TreeAccount {
  email: string;
  password: string;
  passwordHash?: string;
  role: string;
  roleAr: string;
  phone?: string;
  truck?: string;
  gps?: string;
  permissions: string[];
  mods: string[];
}

export interface TreeLoginResult {
  companyUsername: string;
  account: TreeAccount;
  subscriptionStart?: string;
  subscriptionEnd?: string;
  subscriptionStatus?: string;
}

// Fallback module access per tree role (mirrors mobile tree-auth + Console).
const TREE_ROLE_MODS: Record<string, string[]> = {
  sysadmin: ["operations", "production", "workshop", "mixing", "schedule", "orders", "evaluation", "rnd"],
  ptown: ["operations", "production", "workshop", "mixing", "schedule", "orders", "evaluation", "rnd"],
  owner: ["operations", "production", "workshop", "mixing", "schedule", "orders", "evaluation", "rnd"],
  manager: ["operations", "production", "workshop", "mixing", "schedule", "orders", "evaluation"],
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
  rndMgr: ["rnd", "evaluation", "orders"],
  hrOfficer: ["hr", "orders"],
};

function str(v: unknown): string {
  if (v && typeof v === "object" && "stringValue" in v) {
    return typeof (v as { stringValue: unknown }).stringValue === "string"
      ? ((v as { stringValue: string }).stringValue as string)
      : "";
  }
  return "";
}

function mapAccount(fields: Record<string, unknown>): TreeAccount {
  const arr = (v: unknown): string[] =>
    Array.isArray((v as { arrayValue?: { values?: unknown[] } })?.arrayValue?.values)
      ? ((v as { arrayValue: { values: unknown[] } }).arrayValue.values.map(str) as string[])
      : [];
  return {
    email: str(fields.email),
    password: str(fields.password),
    passwordHash: str(fields.passwordHash) || undefined,
    role: str(fields.role),
    roleAr: str(fields.roleAr),
    phone: str(fields.phone) || undefined,
    truck: str(fields.truck) || undefined,
    gps: str(fields.gps) || undefined,
    permissions: arr(fields.permissions),
    mods: arr(fields.mods),
  };
}

/** Find a tree account by phone/email + password across all company trees. */
export async function findTreeAccount(
  identifier: string,
  password: string
): Promise<TreeLoginResult | null> {
  const p = (identifier || "").trim().toLowerCase();
  const pw = password || "";
  if (!p || !pw) return null;
  let docs: Array<{ fields?: Record<string, unknown> }> = [];
  try {
    const token = await firebaseToken();
    const res = await fetch(TREES_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as {
      documents?: Array<{ fields?: Record<string, unknown> }>;
    } | null;
    docs = json?.documents ?? [];
  } catch {
    return null;
  }
  for (const doc of docs) {
    const fields = doc?.fields ?? {};
    const companyUsername = str(fields.companyUsername);
    const rawAccounts = (
      fields.accounts as { arrayValue?: { values?: Array<{ mapValue?: { fields?: Record<string, unknown> } }> } }
    )?.arrayValue?.values ?? [];
    for (const entry of rawAccounts) {
      const account = mapAccount(entry?.mapValue?.fields ?? {});
      const id = (account.email || "").toLowerCase();
      const phoneMatch = (account.phone || "").toLowerCase() === p;
      if (id !== p && !phoneMatch) continue;
      const identifierForHash = account.email || account.phone || "";
      let ok = account.password === pw; // legacy plaintext
      if (!ok && account.passwordHash) {
        try {
          ok = (await hashPassword(identifierForHash, pw)) === account.passwordHash;
        } catch {
          ok = false;
        }
      }
      if (ok) {
        return {
          companyUsername,
          account,
          subscriptionStart: str(fields.subscriptionStart) || undefined,
          subscriptionEnd: str(fields.subscriptionEnd) || undefined,
          subscriptionStatus: str(fields.subscriptionStatus) || undefined,
        };
      }
    }
  }
  return null;
}

/** Convert a tree login into the website UserSession shape (raw tree role kept). */
export function treeResultToSession(result: TreeLoginResult): UserSession {
  const { companyUsername, account } = result;
  return {
    username: account.phone || account.email,
    password: "",
    country: "",
    city: "",
    plantName: companyUsername,
    phone: account.phone || "",
    email: account.email || "",
    status: "TREE_ACCOUNT",
    role: account.role,
    fullName: account.roleAr || account.email || companyUsername,
    mods:
      account.mods.length > 0
        ? [...account.mods]
        : [...(TREE_ROLE_MODS[account.role] ?? [])],
  };
}
