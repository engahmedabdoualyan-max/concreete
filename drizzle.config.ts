import { defineConfig } from "drizzle-kit";

/**
 * FimtoSoft Concrete ERP — Drizzle Kit configuration
 * ─────────────────────────────────────────────────────────
 * Targets the LIVE Supabase PostgreSQL instance via the
 * transaction/connection pooling connection string.
 *
 * Supabase pooled connection strings use port 6543, e.g.:
 *   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
 *
 * Direct connection (port 5432) also works but bypasses the pooler.
 *
 * Set DATABASE_URL in your environment (or a local .env) before running:
 *   npx drizzle-kit generate
 *   npx drizzle-kit migrate
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
  verbose: true,
  strict: true,
});
