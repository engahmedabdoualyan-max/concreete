/**
 * Seed one login per QR visibility tier in the ALMOTWER trial tenant, so the
 * screens can be reviewed as each role actually sees them.
 *
 * ── Why these specific accounts ──────────────────────────────────────────────
 *
 * RBAC splits scans into two tiers, and the only honest way to review that is to
 * hold both in one browser and log out of one and into the other:
 *
 *   FULL  — PLANT_MGR, WORKSHOP_MGR, WORKSHOP_MECHANIC, HR_MANAGER
 *   BASIC — DRIVER, DISPATCHER, HR_OFFICER  (name and truck only, no history)
 *
 * ALMOTWER already had PLANT_MGR, WORKSHOP_MGR, DRIVER and HR_OFFICER. It had no
 * WORKSHOP_MECHANIC, no DISPATCHER and no HR_MANAGER, so those three are created
 * here. Passwords are reset only on the accounts named in PASSWORD_RESET — the
 * rest of the tenant is untouched.
 *
 * ── The role-name trap this sidesteps ────────────────────────────────────────
 *
 * ALMOTWER was seeded with a richer org chart than the application supports:
 * CFO, OPERATIONS_MGR, PRODUCTION_MGR, SCHEDULE_MGR, REPS_MGR, STOREKEEPER,
 * MECHANIC, STATION_TECH, BATCH_OP and LAB_MGR exist in the live `user_role`
 * enum but have no entry in ROLE_PERMISSIONS, so `roleHasPermission` returns
 * false for all of them and those users can do nothing at all. Notably that
 * includes MECHANIC and STOREKEEPER — the mechanic and the storeskeeper, i.e.
 * exactly the roles the anti-fraud spare-parts story is built on.
 *
 * So this script deliberately uses the role names the application grants
 * (WORKSHOP_MECHANIC, BATCH_OPERATOR) rather than the seeded ones (MECHANIC,
 * BATCH_OP). Re-pointing the seeded accounts is a separate decision — it changes
 * who can see what, so it is reported rather than done silently here.
 *
 * Run:  npx tsx scripts/seed-trial-logins.ts
 */
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenants, users, type UserRole } from '@/db/schema';

const TENANT_CODE = 'ALMOTWER';
const PASSWORD = 'Almotwer2026!';

/** Roles we want a login for, and why that tier matters. */
const WANTED: { email: string; role: UserRole; name: string; code: string; why: string }[] = [
  {
    email: 'ptown@almotwer.com',
    role: 'PLANT_MGR',
    name: 'صاحب مصنع',
    code: 'ALW-EMP-001',
    why: 'FULL — the owner, sees the complete record behind any scan',
  },
  {
    email: 'workshopMgr@almotwer.com',
    role: 'WORKSHOP_MGR',
    name: 'مسؤول الورشة',
    code: 'ALW-EMP-002',
    why: 'FULL — workshop manager, and the only role above the mechanic that can DISPOSE stock',
  },
  {
    email: 'mechanicFull@almotwer.com',
    role: 'WORKSHOP_MECHANIC',
    name: 'ميكانيكي',
    code: 'ALW-EMP-003',
    why: 'FULL — fits and removes parts all day, scraps a dead part, cannot dispose',
  },
  {
    email: 'hrManager@almotwer.com',
    role: 'HR_MANAGER',
    name: 'مدير الموارد البشرية',
    code: 'ALW-EMP-004',
    why: 'FULL — owns the employee master and issues employee QR cards',
  },
  {
    email: 'driver@almotwer.com',
    role: 'DRIVER',
    name: 'سائق',
    code: 'ALW-EMP-005',
    why: 'BASIC — confirms a truck is the right one; no repair or cost history',
  },
  {
    email: 'dispatcher@almotwer.com',
    role: 'DISPATCHER',
    name: 'منسق movements',
    code: 'ALW-EMP-006',
    why: 'BASIC — sees which truck and who is driving it, nothing behind it',
  },
];

async function main() {
  const [tenant] = await db
    .select({ id: tenants.id, company: tenants.companyName })
    .from(tenants)
    .where(eq(tenants.tenantCode, TENANT_CODE))
    .limit(1);
  if (!tenant) throw new Error(`tenant ${TENANT_CODE} not found`);
  console.log(`tenant ${tenant.company}\n`);

  const hash = await bcrypt.hash(PASSWORD, 10);

  for (const w of WANTED) {
    const existing = await db
      .select({ id: users.id, role: users.role, name: users.fullName })
      .from(users)
      .where(eq(users.email, w.email))
      .limit(1);

    if (existing[0]) {
      // Only realign the role when it is one the app cannot grant. Overwriting a
      // correct role would silently hand someone more access than they had.
      const supported = (
        [
          'SUPER_ADMIN', 'PLANT_MGR', 'ACCOUNTANT', 'LAB_TECH', 'BATCH_OPERATOR',
          'SALES_REP', 'DRIVER', 'RND_MANAGER', 'HR_OFFICER', 'HR_MANAGER',
          'FINANCE', 'DISPATCHER', 'WORKSHOP_MGR', 'LAB_TECHNICIAN',
          'WORKSHOP_MECHANIC',
        ] as string[]
      ).includes(existing[0].role);

      const needsRole = !supported && existing[0].role !== w.role;
      await db
        .update(users)
        .set({
          passwordHash: hash,
          ...(needsRole ? { role: w.role } : {}),
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing[0].id));

      console.log(
        `  ${needsRole ? '↻' : '·'} ${w.email.padEnd(26)} ${String(existing[0].role).padEnd(18)} → ${w.role.padEnd(18)} password set`
      );
      if (needsRole) {
        console.log(`      (was ${existing[0].role} — a role RBAC grants nothing to)`);
      }
    } else {
      await db.insert(users).values({
        tenantId: tenant.id,
        employeeCode: w.code,
        fullName: w.name,
        email: w.email,
        passwordHash: hash,
        role: w.role,
        isActive: true,
      });
      console.log(`  + ${w.email.padEnd(26)} ${'(new)'.padEnd(18)} → ${w.role.padEnd(18)} created`);
    }
    console.log(`      ${w.why}`);
  }

  console.log(`\npassword for all of the above: ${PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });