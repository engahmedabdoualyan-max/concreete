-- ============================================================
-- 0067_depreciation_replacement_fund_entries.sql
-- فصل الإهلاك المحاسبي عن «تخصيص تجديد الأصل»
-- ============================================================
-- الهدف: ا�� يكون معاك ثمن معدة جديدة وقت انتهاء عمر الأصل.
-- amount_sar      = إجمالي القيد الشهري (إهلاك محاسبي + تخصيص تجديد)
-- book_amount_sar = جزء الإهلاك المحاسبي فقط (يخصم من القيمة الدفترية)
-- الفرق بينهما   = تخصيص صندوق التجديد (لا يخفض القيمة الدفترية)
-- ============================================================

ALTER TABLE "depreciation_entries"
  ADD COLUMN IF NOT EXISTS "book_amount_sar" integer;

UPDATE "depreciation_entries"
SET "book_amount_sar" = "amount_sar"
WHERE "book_amount_sar" IS NULL;

ALTER TABLE "depreciation_entries"
  ALTER COLUMN "book_amount_sar" SET DEFAULT 0,
  ALTER COLUMN "book_amount_sar" SET NOT NULL;

COMMENT ON COLUMN "depreciation_entries"."book_amount_sar" IS 'جزء الإهلاك المحاسبي (يخصم من القيمة الدفترية) — SAR cents';
COMMENT ON COLUMN "depreciation_entries"."amount_sar" IS 'إجمالي القيد الشهري = إهلاك محاسبي + تخصيص تجديد — SAR cents';
