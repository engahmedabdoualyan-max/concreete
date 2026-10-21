-- ============================================================
-- 0068_depreciation_frozen_replacement_target.sql
-- تثبيت «هدف التجديد» عند ثمن معدة جديدة في آخر عمر الأصل
-- ============================================================
-- الهدف: لازم يتجمع فعلاً ثمن معدة جديدة بسعر النهاردة (بعد التضخم)
-- في لحظة انتهاء عمر الأصل. لو الهدف بيتحسب كل شهر من سعر النهاردة
-- والتضخم، بيبقى ناقص في آخر عمر الأصل — فبنثبّته وقت الحفظ.
-- ============================================================

ALTER TABLE "depreciation_assets"
  ADD COLUMN IF NOT EXISTS "replacement_target_sar" integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN "depreciation_assets"."replacement_target_sar" IS
  'هدف التجديد المثبّت: ثمن معدة جديدة مضافاً إليه التضخم حتى آخر عمر الأصل (SAR cents)';

-- الأصول القديمة ما كانش ليها هدف تجديد — نبدأها من صفر
UPDATE "depreciation_assets"
SET "replacement_target_sar" = 0
WHERE "replacement_target_sar" IS NULL;

-- معدل التضخم: NULL = خد معدل المنشأة الافتراضي · رقم = اختيار صريح
ALTER TABLE "depreciation_assets"
  ALTER COLUMN "inflation_rate_pct" DROP NOT NULL;
ALTER TABLE "depreciation_assets"
  ALTER COLUMN "inflation_rate_pct" DROP DEFAULT;

UPDATE "depreciation_assets"
SET "inflation_rate_pct" = NULL
WHERE "inflation_rate_pct" = 0;
