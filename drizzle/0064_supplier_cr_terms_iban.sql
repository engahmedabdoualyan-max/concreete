-- Supplier procurement identity fields (مفاتيح المورد)
--
--   cr_number      → السجل التجاري
--   payment_terms  → شروط الدفع المتفق عليها («30 يوم» · «كاش عند التسليم»)
--   bank_iban      → آيبان المورد — وجهة التحويل عند السداد
--
-- All three are nullable: existing rows keep working, the purchases manager
-- fills them in as contracts are renewed.
--
-- NOTE: applied manually on the live Supabase DB (2026-10-20), like 0060–0063.
-- Not added to the drizzle journal on purpose.
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "cr_number" varchar(32);
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "payment_terms" varchar(120);
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "bank_iban" varchar(40);
