/**
 * Verifies the FLEET_POSITION_READ matrix against the roles actually stored in
 * the database — not against the ones in schema.ts.
 *
 * WHY THIS EXISTS RATHER THAN AN HTTP PROBE
 * Ten of the roles (`CFO`, `OPERATIONS_MGR`, `MECHANIC`, `REPS_MGR`, …) exist in
 * the live `user_role` enum and were never in `schema.ts`, so their accounts have
 * never been able to log in with the seeded trial password. Logging them in just
 * to prove a permission would mean resetting their passwords, which is a change
 * to a live database for no reason.
 *
 * So this calls `userHasPermission` — the exact function `requirePermission`
 * calls, with the same signature — using each user's real role string read from
 * Postgres. That tests the decision the route actually makes, and it cannot
 * silently pass on a role that does not exist.
 *
 * Run: npx tsx scripts/.verify-fleet-position-roles.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { PERMISSIONS, ROLE_PERMISSIONS, userHasPermission, roleHasPermission } from "../src/lib/auth/rbac";
import type { UserRole } from "../src/db/schema";

const TENANT_CODE = "ALMOTWER";

/** Roles that must NOT see the whole fleet map. */
const DENY = ["DRIVER"];
/** Roles the owner explicitly said may see it. */
const ALLOW = [
  "SUPER_ADMIN",
  "PLANT_MGR",
  "DISPATCHER",
  "WORKSHOP_MGR",
  "WORKSHOP_MECHANIC",
  "MECHANIC",
  "OPERATIONS_MGR",
  "RND_MANAGER",
  "REPS_MGR",
  "SALES_REP",
  "SCHEDULE_MGR",
  "PRODUCTION_MGR",
  "LAB_MGR",
  "HR_OFFICER",
  "HR_MANAGER",
];

async function main() {
  const tenant = await db.execute(sql`
    SELECT id FROM tenants WHERE tenant_code = ${TENANT_CODE} LIMIT 1
  `);
  const tenantId = (tenant.rows as { id: string }[])[0]?.id;
  if (!tenantId) throw new Error(`tenant ${TENANT_CODE} not found`);

  const users = await db.execute(sql`
    SELECT role::text AS role, count(*)::int AS n
    FROM users
    WHERE tenant_id = ${tenantId} AND is_active = true
    GROUP BY role ORDER BY role
  `);
  const rows = users.rows as { role: string; n: number }[];

  console.log(
    `${"ROLE".padEnd(20)}${"ACCTS".padEnd(7)}${"fleet:position:read".padEnd(21)}verdict`
  );

  let failures = 0;

  for (const { role, n } of rows) {
    const has = userHasPermission(role as never, [], PERMISSIONS.FLEET_POSITION_READ);
    const expected = ALLOW.includes(role);
    const ok = has === expected;
    if (!ok) failures++;

    let verdict: string;
    if (!ok) {
      verdict = `UNEXPECTED (want ${expected ? "allow" : "deny"})`;
    } else if (DENY.includes(role)) {
      verdict = "denied ✓ (by design)";
    } else if (expected) {
      verdict = "allowed ✓";
    } else {
      verdict = "not granted (not requested)";
    }

    console.log(
      `${role.padEnd(20)}${String(n).padEnd(7)}${(has ? "yes" : "no").padEnd(21)}${verdict}`
    );
  }

  // The deny list is a hard requirement: a driver seeing the fleet map is the
  // specific thing the owner ruled out.
  for (const role of DENY) {
    if (roleHasPermission(role as never, PERMISSIONS.FLEET_POSITION_READ)) {
      console.error(`\nFAIL: ${role} must not hold FLEET_POSITION_READ`);
      failures++;
    }
  }

  // Every granted role must also be able to read the sites it is measured
  // against, otherwise the panel would render distances with no site behind them.
  for (const role of ALLOW) {
    if (
      roleHasPermission(role as never, PERMISSIONS.FLEET_POSITION_READ) &&
      !roleHasPermission(role as never, PERMISSIONS.SITE_READ)
    ) {
      console.error(`\nFAIL: ${role} can see positions but not the sites`);
      failures++;
    }
  }

  // Only the owner may move a site — asserted as an exact allow-list, not a
  // "not granted to" check, because adding 10 roles to the table is exactly the
  // change that could accidentally hand out SITE_WRITE.
  //
  // PLANT_MGR IS the owner at this plant: `ptown@almotwer.com` holds that role
  // and nothing above it except SUPER_ADMIN does. SUPER_ADMIN is the wildcard
  // grant (`Object.values(PERMISSIONS)`), so it is every permission by definition.
  const writers = (Object.keys(ROLE_PERMISSIONS) as UserRole[])
    .filter((r) => roleHasPermission(r, PERMISSIONS.SITE_WRITE))
    .sort();
  const expectedWriters = ["PLANT_MGR", "SUPER_ADMIN"];
  if (writers.join(",") !== expectedWriters.join(",")) {
    console.error(
      `\nFAIL: SITE_WRITE held by [${writers.join(", ")}], expected [${expectedWriters.join(", ")}]`
    );
    failures++;
  } else {
    console.log(`\nSITE_WRITE held by: ${writers.join(", ")} ✓`);
  }

  console.log(
    failures === 0
      ? `\nAll checks passed across ${rows.length} live role(s).`
      : `\n${failures} FAILURE(S).`
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
});