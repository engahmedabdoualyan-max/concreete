-- Contract period on payroll_employees (website HR form: contract start/end,
-- drives the 60-day contract-expiry watch like iqama_expiry).
--
-- NOTE: applied manually on the live Supabase DB (ADD COLUMN IF NOT EXISTS)
-- on 2026-10-19, because this database tracks migrations via push. Not added
-- to the drizzle journal on purpose.
ALTER TABLE "payroll_employees" ADD COLUMN IF NOT EXISTS "contract_start" timestamp;
ALTER TABLE "payroll_employees" ADD COLUMN IF NOT EXISTS "contract_end" timestamp;
