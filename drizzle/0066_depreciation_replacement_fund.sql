-- ============================================================
-- 0066_depreciation_replacement_fund.sql
-- صندوق تجديد الأصول + قيم التسييل + تقدير العمر
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "depreciation_life_source" AS ENUM ('type_default','manual','manufacture_year');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "depreciation_assets"
  ADD COLUMN IF NOT EXISTS "useful_life_years" integer,
  ADD COLUMN IF NOT EXISTS "life_source" "depreciation_life_source" NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "replacement_cost_est_sar" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inflation_rate_pct" numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "assessment_value_sar" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "replacement_source" varchar(40);

-- Backfill existing assets to manual so behavior stays unchanged
UPDATE "depreciation_assets"
SET "life_source" = 'manual'
WHERE "life_source" IS NULL;

COMMENT ON COLUMN "depreciation_assets"."useful_life_years" IS 'عمر افتراضي بالسنوات';
COMMENT ON COLUMN "depreciation_assets"."life_source" IS 'كيف تم تحديد العمر';
COMMENT ON COLUMN "depreciation_assets"."replacement_cost_est_sar" IS 'ثمن معدة جديدة مشابهة مقترح (SAR cents)';
COMMENT ON COLUMN "depreciation_assets"."inflation_rate_pct" IS 'معدل تضخم سنوي %';
COMMENT ON COLUMN "depreciation_assets"."assessment_value_sar" IS 'قيمة تقييم بحالة حالية / تسييل (SAR cents) - حد أدنى للقيمة الدفترية';
COMMENT ON COLUMN "depreciation_assets"."replacement_source" IS 'مصدر الاقتراح: last_po | manual';

-- ─── Tenant-level depreciation settings (default inflation rate …) ───────────
CREATE TABLE IF NOT EXISTS "depreciation_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "default_inflation_rate_pct" numeric(5,2) NOT NULL DEFAULT '3.00',
  "default_life_years" integer NOT NULL DEFAULT 10,
  "updated_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_dep_settings_tenant" ON "depreciation_settings" ("tenant_id");

COMMENT ON TABLE "depreciation_settings" IS 'إعدادات إهلاك الأصول على مستوى المنشأة (معدل التضخم الافتراضي …)';
