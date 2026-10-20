-- 0065 — نثريات الموظفين + إهلاك معدات + فواتير الموردين (مجال العمل)
-- Applied manually on the live Supabase DB (2026-10-20), like 0060–0064.
-- Not added to the drizzle journal (same pattern as 0064).

-- ═══════════════════════════════════════════════════════════════════════════
-- A) نثريات — employee fuel / car rent / housing (auto-linked ledger entries)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE misc_expense_kind AS ENUM (
  'employee_fuel',      -- بنزين الموظفين
  'employee_car_rent',  -- إيجار سيارات الموظفين
  'employee_housing'    -- سكن الموظفين
);

CREATE TABLE misc_expenses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  kind             misc_expense_kind NOT NULL,
  employee_id      uuid REFERENCES payroll_employees(id) ON DELETE SET NULL,
  -- snapshot so the history survives an employee removal / rename
  employee_name    varchar(120),
  period_month     date NOT NULL, -- first day of the covered month
  amount_sar       integer NOT NULL, -- SAR cents
  payment_date     date NOT NULL,
  payment_method   expense_payment_method NOT NULL DEFAULT 'cash',
  notes            text,
  reference_number varchar(100),
  ledger_entry_id  uuid REFERENCES ledger_entries(id) ON DELETE SET NULL,
  created_by_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at       timestamp NOT NULL DEFAULT now(),
  CONSTRAINT misc_expenses_amount_positive CHECK (amount_sar > 0)
);

CREATE INDEX idx_misc_expenses_tenant   ON misc_expenses(tenant_id);
CREATE INDEX idx_misc_expenses_period   ON misc_expenses(tenant_id, period_month);
CREATE INDEX idx_misc_expenses_kind     ON misc_expenses(tenant_id, kind);
CREATE INDEX idx_misc_expenses_employee ON misc_expenses(employee_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- B) إهلاك معدات — depreciation assets (vehicles + equipment), run by rates
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE depreciation_source AS ENUM ('vehicle', 'equipment');

CREATE TABLE depreciation_assets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  source             depreciation_source NOT NULL DEFAULT 'vehicle',
  vehicle_id         uuid REFERENCES fleet_vehicles(id) ON DELETE RESTRICT,
  equipment_id       uuid REFERENCES equipment(id) ON DELETE RESTRICT,
  asset_label        varchar(120) NOT NULL, -- plate/code snapshot for display
  purchase_cost_sar  integer NOT NULL,      -- SAR cents
  purchase_date      date,
  annual_rate_pct    numeric(5,2) NOT NULL, -- 25.00 = 25% per year (straight line)
  salvage_value_sar  integer NOT NULL DEFAULT 0,
  is_active          boolean NOT NULL DEFAULT true,
  notes              text,
  created_by_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at         timestamp NOT NULL DEFAULT now(),
  updated_at         timestamp NOT NULL DEFAULT now(),
  CONSTRAINT dep_asset_target CHECK (
    (source = 'vehicle'   AND vehicle_id   IS NOT NULL) OR
    (source = 'equipment' AND equipment_id IS NOT NULL)
  ),
  CONSTRAINT dep_asset_cost_positive CHECK (purchase_cost_sar > 0),
  CONSTRAINT dep_asset_rate_range    CHECK (annual_rate_pct > 0 AND annual_rate_pct <= 100)
);

CREATE INDEX idx_dep_assets_tenant ON depreciation_assets(tenant_id);
CREATE UNIQUE INDEX uq_dep_assets_vehicle   ON depreciation_assets(tenant_id, vehicle_id)   WHERE vehicle_id   IS NOT NULL;
CREATE UNIQUE INDEX uq_dep_assets_equipment ON depreciation_assets(tenant_id, equipment_id)  WHERE equipment_id IS NOT NULL;

CREATE TABLE depreciation_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  asset_id         uuid NOT NULL REFERENCES depreciation_assets(id) ON DELETE CASCADE,
  period_month     date NOT NULL, -- first day of the depreciated month
  amount_sar       integer NOT NULL, -- SAR cents
  ledger_entry_id  uuid REFERENCES ledger_entries(id) ON DELETE SET NULL,
  created_by_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at       timestamp NOT NULL DEFAULT now()
);

-- idempotent "تشغيل": running the same month twice never double-posts
CREATE UNIQUE INDEX uq_dep_entries_period    ON depreciation_entries(tenant_id, asset_id, period_month);
CREATE INDEX idx_dep_entries_period_tenant   ON depreciation_entries(tenant_id, period_month);

-- ═══════════════════════════════════════════════════════════════════════════
-- C) الموردين — مجال العمل + فواتير المورد + سداد الفواتير
-- ═══════════════════════════════════════════════════════════════════════════

-- line of business (اسمنت، رمل، قطع غيار …) — free text so the register can grow
ALTER TABLE suppliers ADD COLUMN category varchar(60);

CREATE TYPE supplier_invoice_status AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

CREATE TABLE supplier_invoices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  invoice_number     varchar(30) NOT NULL, -- SINV-2026-00001 (unique per tenant)
  supplier_id        uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  -- optional link: a PO turned into an invoice is counted ONCE in the statement
  purchase_order_id  uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  invoice_date       date NOT NULL,
  due_date           date,
  subtotal_sar       integer NOT NULL DEFAULT 0, -- SAR cents
  vat_percent        integer NOT NULL DEFAULT 15,
  vat_amount_sar     integer NOT NULL DEFAULT 0,
  total_amount_sar   integer NOT NULL DEFAULT 0,
  paid_amount_sar    integer NOT NULL DEFAULT 0,
  status             supplier_invoice_status NOT NULL DEFAULT 'OPEN',
  description        text,
  notes              text,
  created_by_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at         timestamp NOT NULL DEFAULT now(),
  updated_at         timestamp NOT NULL DEFAULT now(),
  CONSTRAINT sinv_total_positive CHECK (total_amount_sar > 0)
);

CREATE UNIQUE INDEX uq_supplier_invoices_number   ON supplier_invoices(tenant_id, invoice_number);
CREATE INDEX        idx_supplier_invoices_supplier ON supplier_invoices(supplier_id);
CREATE INDEX        idx_supplier_invoices_tenant   ON supplier_invoices(tenant_id);
CREATE INDEX        idx_supplier_invoices_po       ON supplier_invoices(purchase_order_id);

-- a payment now targets a PO **or** an invoice (exactly one)
ALTER TABLE supplier_payments
  ADD COLUMN invoice_id uuid REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
  ALTER COLUMN purchase_order_id DROP NOT NULL,
  ADD CONSTRAINT sp_target_check CHECK (
    (purchase_order_id IS NOT NULL) <> (invoice_id IS NOT NULL)
  );
