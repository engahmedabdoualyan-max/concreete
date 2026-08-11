/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE ERP — Create ERP User (CLI)
 *  scripts/create-user.ts
 * ============================================================
 *
 *  Creates a user (employee) directly in the database with a
 *  bcrypt-hashed password, ready to sign in from the mobile app.
 *
 *  USAGE
 *  ─────────────────────────────────────────────────────────────
 *    npx tsx scripts/create-user.ts \
 *      --full-name "Ahmed Ali" \
 *      --email ahmed@fimtosoft.com \
 *      --phone 0500000001 \
 *      --password "Passw0rd!" \
 *      --role DRIVER \
 *      --code DRV-002
 *
 *  OPTIONS
 *  ─────────────────────────────────────────────────────────────
 *    --full-name  (required) Display name of the employee
 *    --email      (required) Unique login email
 *    --phone      (required) Mobile number. Accepts 05xxxxxxxx
 *                           or +9665xxxxxxxx; stored as +966...
 *    --password   (required) Plain password (min 6 chars)
 *    --role       (required) One of the user_role enum values
 *    --code       (optional) Employee code (auto: EMP-<n>)
 *    --tenant     (optional) Tenant id (defaults to FIMTO01)
 *    --zone       (optional) Geographic zone (e.g. "Al-Sharqia East")
 *
 *  ROLES (from user_role enum)
 *  ─────────────────────────────────────────────────────────────
 *    SUPER_ADMIN, PLANT_MGR, ACCOUNTANT, LAB_TECH, BATCH_OPERATOR,
 *    SALES_REP, DRIVER, FINANCE, DISPATCHER, WORKSHOP_MGR,
 *    LAB_TECHNICIAN, WORKSHOP_MECHANIC
 * ============================================================
 */

import { Pool } from "pg";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";

dotenv.config();

const VALID_ROLES = [
  "SUPER_ADMIN",
  "PLANT_MGR",
  "ACCOUNTANT",
  "LAB_TECH",
  "BATCH_OPERATOR",
  "SALES_REP",
  "DRIVER",
  "FINANCE",
  "DISPATCHER",
  "WORKSHOP_MGR",
  "LAB_TECHNICIAN",
  "WORKSHOP_MECHANIC",
] as const;

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1] ?? "";
  }
  return args;
}

function normalizePhone(input: string): string {
  let digits = input.replace(/[\s\-()]/g, "");
  if (!digits.startsWith("+")) {
    if (digits.startsWith("966") && digits.length === 12) {
      digits = `+${digits}`;
    } else if (digits.startsWith("05") && digits.length === 10) {
      digits = `+966${digits.slice(1)}`;
    } else if (digits.startsWith("0")) {
      digits = `+${digits.slice(1)}`;
    }
  }
  return digits;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const fullName = args["full-name"]?.trim();
  const email = args.email?.trim().toLowerCase();
  const phoneInput = args.phone?.trim();
  const password = args.password;
  const role = args.role?.toUpperCase();
  const employeeCode = args.code?.trim();
  const zone = args.zone?.trim();
  const tenantId = args.tenant?.trim();

  const missing = [];
  if (!fullName) missing.push("--full-name");
  if (!email) missing.push("--email");
  if (!phoneInput) missing.push("--phone");
  if (!password) missing.push("--password");
  if (!role) missing.push("--role");

  if (missing.length) {
    console.error(`Missing required args: ${missing.join(", ")}`);
    console.error(
      "Example: npx tsx scripts/create-user.ts --full-name \"Ahmed Ali\" --email ahmed@fimtosoft.com --phone 0500000001 --password \"Passw0rd!\" --role DRIVER --code DRV-002"
    );
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    console.error(`Invalid role "${role}". Valid roles: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("Password must be at least 6 characters.");
    process.exit(1);
  }

  const phone = normalizePhone(phoneInput);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const client = await pool.connect();
    try {
      let finalTenantId = tenantId;
      if (!finalTenantId) {
        const ten = await client.query(
          `SELECT id FROM tenants WHERE tenant_code = 'FIMTO01' LIMIT 1`
        );
        if (!ten.rows.length) {
          console.error("No tenant found. Pass --tenant <uuid>.");
          process.exit(1);
        }
        finalTenantId = ten.rows[0].id;
      }

      let finalCode = employeeCode;
      if (!finalCode) {
        const seq = await client.query(
          `SELECT count(*)::int AS n FROM users WHERE tenant_id = $1`,
          [finalTenantId]
        );
        finalCode = `EMP-${String(seq.rows[0].n + 1).padStart(3, "0")}`;
      }

      const passwordHash = bcrypt.hashSync(password, 10);

      const result = await client.query(
        `INSERT INTO users
           (tenant_id, employee_code, full_name, email, phone_number, password_hash, role, zone, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, now(), now())
         RETURNING id, employee_code, full_name, email, phone_number, role`,
        [finalTenantId, finalCode, fullName, email, phone, passwordHash, role, zone ?? null]
      );

      console.log("✔ User created successfully:");
      console.log(JSON.stringify(result.rows[0], null, 2));
      console.log(`\nSign-in from the app:\n  Phone:    ${phone}\n  Password: ${password}`);
    } finally {
      client.release();
    }
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === "23505") {
      console.error(
        "Conflict: a user with this employee_code or email already exists. Choose different values."
      );
    } else {
      console.error("Failed to create user:", e.message);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
