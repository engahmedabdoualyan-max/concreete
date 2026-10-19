-- Split the employee profession into two fields:
--   job_title        → المهنة الحالية   (the actual/current job at the plant)
--   iqama_job_title  → المهنة في الإقامة (the official profession on the iqama)
--
-- The old single `job_title` held the iqama profession; the owner's
-- عقود العمل sheet carries the current one. Both are now kept per employee.
--
-- NOTE: applied manually on the live Supabase DB (2026-10-19) because this
-- database tracks migrations via push. Not added to the drizzle journal on purpose.
ALTER TABLE "payroll_employees" ADD COLUMN IF NOT EXISTS "iqama_job_title" varchar(120);
