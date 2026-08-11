-- ============================================================
-- Fimto Soft Concrete ERP — Multi-Tenant Safety & Immutability
-- PostgreSQL trigger functions for Supabase
-- ============================================================

-- 1) Every multi-tenant row must carry tenant_id.
CREATE OR REPLACE FUNCTION fimto_assert_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_ID_REQUIRED: % requires tenant_id', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Weighbridge ledger is append-only.
CREATE OR REPLACE FUNCTION fimto_block_weighbridge_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_LEDGER: weighbridge_transactions is append-only. Reversal must be appended as a new transaction.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_weighbridge_no_update ON weighbridge_transactions;
DROP TRIGGER IF EXISTS trg_weighbridge_no_delete ON weighbridge_transactions;
CREATE TRIGGER trg_weighbridge_no_update
BEFORE UPDATE ON weighbridge_transactions
FOR EACH ROW EXECUTE FUNCTION fimto_block_weighbridge_mutation();
CREATE TRIGGER trg_weighbridge_no_delete
BEFORE DELETE ON weighbridge_transactions
FOR EACH ROW EXECUTE FUNCTION fimto_block_weighbridge_mutation();

-- 3) Attach tenant guard triggers to every public table with tenant_id.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenant_id'
      AND table_name <> 'tenants'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_assert_tenant ON %I', r.table_name, r.table_name);
    EXECUTE format('CREATE TRIGGER trg_%I_assert_tenant BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fimto_assert_tenant_id()', r.table_name, r.table_name);
  END LOOP;
END $$;

-- 4) Optional Supabase RLS baseline. The app still enforces tenant_id in code;
--    this adds a second DB-level safety net for clients using Supabase JWTs.
--    Assumes JWT contains claim: tenant_id.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenant_id'
      AND table_name <> 'tenants'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS fimto_tenant_isolation ON %I', r.table_name);
    EXECUTE format(
      'CREATE POLICY fimto_tenant_isolation ON %I USING (tenant_id::text = COALESCE(current_setting(''request.jwt.claims'', true)::jsonb->>''tenant_id'', tenant_id::text)) WITH CHECK (tenant_id::text = COALESCE(current_setting(''request.jwt.claims'', true)::jsonb->>''tenant_id'', tenant_id::text))',
      r.table_name
    );
  END LOOP;
END $$;
