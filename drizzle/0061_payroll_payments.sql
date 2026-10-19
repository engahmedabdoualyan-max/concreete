-- Payroll cash-collection ledger — بيان القبض الشهري.
--
-- One row per employee per month (YYYY-MM) holding: status
-- (UNPAID | PAID | PARTIAL | STOPPED), the salary due snapshot, the amount
-- actually paid, the amount deducted, a reason/note and the signed سند قبض
-- (a hr_documents row). Independent of payroll_runs so a month can be tracked
-- before a run exists.
--
-- NOTE: applied manually on the live Supabase DB (2026-10-19) because this
-- database tracks migrations via push. Not added to the drizzle journal.
CREATE TABLE IF NOT EXISTS "payroll_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "employee_id" uuid NOT NULL REFERENCES "payroll_employees"("id") ON DELETE CASCADE,
  "period" varchar(7) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'UNPAID',
  "due_amount_sar" numeric(12,2),
  "paid_amount_sar" numeric(12,2),
  "deduction_sar" numeric(12,2),
  "note" varchar(300),
  "receipt_document_id" uuid REFERENCES "hr_documents"("id") ON DELETE SET NULL,
  "paid_at" timestamp,
  "updated_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_payments_tenant_emp_period_unique"
  ON "payroll_payments" ("tenant_id", "employee_id", "period");
CREATE INDEX IF NOT EXISTS "idx_pay_payment_period"
  ON "payroll_payments" ("tenant_id", "period");
CREATE INDEX IF NOT EXISTS "idx_pay_payment_emp"
  ON "payroll_payments" ("employee_id");
