/**
 * Resets the trial password for every active ALMOTWER account.
 *
 * WHY
 * The plant's trial accounts were seeded by `seed-trial-logins.ts`, which only
 * covered six roles. The other sixteen accounts exist in the live database with
 * password hashes nobody knows, so they cannot be logged into — including all
 * ten roles that were missing from `schema.ts` and are only now able to do
 * anything at all. To let the owner walk the screens for every role, every
 * active account in the tenant gets the same throwaway trial password.
 *
 * This is a development/verification tenant. It is NOT a production reset.
 *
 * Run: DATABASE_URL=... npx tsx scripts/.reset-trial-passwords.ts
 */
import bcrypt from "bcryptjs";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../src/db";
import { tenants, users } from "../src/db/schema";
import { roleHasPermission, PERMISSIONS } from "../src/lib/auth/rbac";
import type { UserRole } from "../src/db/schema";

const TENANT_CODE = "ALMOTWER";
const PASSWORD = "Almotwer2026!";

async function main() {
  const [tenant] = await db
    .select({ id: tenants.id, company: tenants.companyName })
    .from(tenants)
    .where(eq(tenants.tenantCode, TENANT_CODE))
    .limit(1);
  if (!tenant) throw new Error(`tenant ${TENANT_CODE} not found`);
  console.log(`tenant: ${tenant.company}\n`);

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.fullName,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.tenantId, tenant.id))
    .orderBy(users.role, users.email);

  const hash = await bcrypt.hash(PASSWORD, 10);

  let touched = 0;
  for (const u of rows) {
    if (!u.isActive) {
      console.log(`  – ${u.email.padEnd(28)} ${String(u.role).padEnd(18)} inactive, skipped`);
      continue;
    }
    await db
      .update(users)
      .set({ passwordHash: hash, updatedAt: new Date() })
      .where(eq(users.id, u.id));
    touched++;

    // The fleet-positions grant is the thing being demonstrated, so print it.
    const pos = roleHasPermission(u.role as UserRole, PERMISSIONS.FLEET_POSITION_READ);
    const sites = roleHasPermission(u.role as UserRole, PERMISSIONS.SITE_READ);
    const write = roleHasPermission(u.role as UserRole, PERMISSIONS.SITE_WRITE);
    console.log(
      `  ✓ ${u.email.padEnd(28)} ${String(u.role).padEnd(18)}` +
        ` fleet=${pos ? "Y" : "n"} sites=${sites ? "Y" : "n"} write=${write ? "Y" : "n"}`
    );
  }

  // Prove the count actually landed rather than trusting the loop.
  const [check] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.isActive, true)));

  console.log(`\n${touched} password(s) set; ${check?.n ?? 0} active account(s) in tenant.`);
  console.log(`password for all of them: ${PASSWORD}`);
  console.log(`\nsign in at the website, then open /#/sites → تبويب "الأسطول"`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });