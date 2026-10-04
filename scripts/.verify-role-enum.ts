/**
 * Proves `userRoleEnum` in schema.ts and the live `user_role` Postgres enum
 * agree exactly — same values, same count, and same ORDER.
 *
 * WHY ORDER MATTERS HERE
 * Postgres preserves enum declaration order and `drizzle-kit generate` diffs the
 * declared list against the live one. Declaring the same 25 values in a different
 * order would make the next generated migration want to "fix" a live enum that 22
 * accounts are assigned to. Declaring FEWER would make it want to drop roles in
 * active use — which is what was actually wrong here until schema.ts was brought
 * in line: ten roles existed in the database and nowhere else.
 *
 * This fails loudly rather than quietly, because a silent drift here does not
 * show up as an error anywhere until it destroys somebody's role.
 *
 * Run: DATABASE_URL=... npx tsx scripts/.verify-role-enum.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { userRoleEnum } from "../src/db/schema";

async function main() {
  const res = await db.execute(
    sql`SELECT unnest(enum_range(NULL::user_role))::text AS role`
  );
  const live = (res.rows as { role: string }[]).map((r) => r.role);
  const declared = userRoleEnum.enumValues as string[];

  const inDbNotSchema = live.filter((r) => !declared.includes(r));
  const inSchemaNotDb = declared.filter((r) => !live.includes(r));
  const orderOk = live.length === declared.length && live.every((r, i) => r === declared[i]);

  let failures = 0;

  const check = (label: string, bad: string[], expected: string[]) => {
    if (bad.length) {
      console.error(`FAIL: ${label} — ${bad.join(", ")}`);
      failures++;
    } else {
      console.log(`ok: ${label} — none (expected: ${expected})`);
    }
  };

  check("in DB but not declared in schema.ts", inDbNotSchema, "none");
  check("declared in schema.ts but not in DB", inSchemaNotDb, "none");

  if (!orderOk) {
    console.error("FAIL: declared order differs from live enum order");
    for (let i = 0; i < Math.max(live.length, declared.length); i++) {
      if (live[i] !== declared[i]) {
        console.error(`  position ${i + 1}: db=${live[i] ?? "—"} schema=${declared[i] ?? "—"}`);
      }
    }
    failures++;
  } else {
    console.log("ok: declared order matches live enum order exactly");
  }

  console.log(`\n${declared.length} role(s); ${failures} failure(s)`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
});