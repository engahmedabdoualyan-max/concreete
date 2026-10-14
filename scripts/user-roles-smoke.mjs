/**
 * User-role parity smoke test (plain node, no dependencies).
 *
 * Guards against a repeat of the stale-USER_ROLES bug: the two user-management
 * API routes must accept every role in the DB enum / RBAC validator, and must
 * not accept unknown roles.
 *
 * Run: node scripts/user-roles-smoke.mjs  (or: npm run test:roles)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function extractQuotedRoles(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `end marker not found: ${endMarker}`);
  const block = source.slice(start, end);
  const roles = [...block.matchAll(/"([A-Z][A-Z_]+)"/g)].map((m) => m[1]);
  assert.ok(roles.length > 0, `no roles parsed after ${startMarker}`);
  return new Set(roles);
}

const schema = readFileSync("src/db/schema.ts", "utf8");
const rbac = readFileSync("src/lib/auth/rbac.ts", "utf8");
const usersRoute = readFileSync("src/app/api/users/route.ts", "utf8");
const userIdRoute = readFileSync("src/app/api/users/[userId]/route.ts", "utf8");

// DB enum block: `export const userRoleEnum = pgEnum("user_role", [ ... ])`
const dbRoles = extractQuotedRoles(
  schema,
  'pgEnum("user_role"',
  "]);"
);
// RBAC validator block
const rbacRoles = extractQuotedRoles(
  rbac,
  "const validRoles: UserRole[] = [",
  "];"
);
// Route allow-lists
const createRoles = extractQuotedRoles(usersRoute, "const USER_ROLES = [", "as const;");
const updateRoles = extractQuotedRoles(userIdRoute, "const USER_ROLES = [", "as const;");

const fmt = (s) => [...s].sort().join(", ");

// 1. DB enum should cover every RBAC-valid role. Extra DB-only roles are
// reported, not fatal: the role model may legitimately carry legacy or
// staged roles that RBAC has not enabled yet.
const dbOnly = [...dbRoles].filter((r) => !rbacRoles.has(r));
if (dbOnly.length > 0) {
  console.warn(`NOTE: DB-only roles (not enabled in RBAC): ${dbOnly.sort().join(", ")}`);
}
const rbacNotInDb = [...rbacRoles].filter((r) => !dbRoles.has(r));
assert.equal(
  rbacNotInDb.length,
  0,
  `RBAC accepts role(s) missing from the DB enum: ${rbacNotInDb.join(", ")}`
);

// 2. Both user routes must accept every valid role.
for (const [name, set] of [["POST /api/users", createRoles], ["PATCH /api/users/:id", updateRoles]]) {
  const missing = [...rbacRoles].filter((r) => !set.has(r));
  assert.equal(missing.length, 0, `${name} rejects valid role(s): ${missing.join(", ")}`);
}

// 3. Routes must not accept unknown roles.
for (const [name, set] of [["POST /api/users", createRoles], ["PATCH /api/users/:id", updateRoles]]) {
  const unknown = [...set].filter((r) => !rbacRoles.has(r));
  assert.equal(unknown.length, 0, `${name} accepts unknown role(s): ${unknown.join(", ")}`);
}

// 4. The two routes must agree with each other.
assert.deepEqual(
  [...createRoles].sort(),
  [...updateRoles].sort(),
  "POST and PATCH role lists diverged."
);

console.log(`user-roles smoke passed (${rbacRoles.size} roles in parity across schema/RBAC/both user routes).`);
