-- customer_invoices — فواتير العملاء (مبيعات)
-- Similar to supplier_invoices but for customer sales

CREATE TYPE customer_invoice_status_enum AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

CREATE TABLE IF NOT EXISTS customer_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    -- CINV-2026-00001 — unique per tenant
    invoice_number VARCHAR(30) NOT NULL,
    customer_id UUID REFERENCES clients(id) ON DELETE RESTRICT,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    invoice_date DATE NOT NULL,
    due_date DATE,
    -- SAR cents
    subtotal_sar INTEGER NOT NULL DEFAULT 0,
    vat_percent INTEGER NOT NULL DEFAULT 15,
    vat_amount_sar INTEGER NOT NULL DEFAULT 0,
    total_amount_sar INTEGER NOT NULL DEFAULT 0,
    paid_amount_sar INTEGER NOT NULL DEFAULT 0,
    status customer_invoice_status_enum NOT NULL DEFAULT 'OPEN',
    description TEXT,
    notes TEXT,
    created_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_invoices_tenant ON customer_invoices(tenant_id);
CREATE INDEX idx_customer_invoices_customer ON customer_invoices(customer_id);
CREATE INDEX idx_customer_invoices_order ON customer_invoices(order_id);
CREATE INDEX idx_customer_invoices_status ON customer_invoices(status);
CREATE UNIQUE INDEX uq_customer_invoices_number ON customer_invoices(tenant_id, invoice_number);

-- customer_payments — سدادات العملاء ضد الفواتير
-- invoice_id اختياري: سداد مباشر بدون فاتورة
-- Auto-links a ledger entry (transaction_type = 'sale')
CREATE TYPE customer_payment_mode_enum AS ENUM ('BANK', 'CASH', 'CARD', 'WALLET', 'OTHER');

CREATE TABLE IF NOT EXISTS customer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    invoice_id UUID REFERENCES customer_invoices(id) ON DELETE RESTRICT,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    amount_sar INTEGER NOT NULL,
    payment_mode customer_payment_mode_enum NOT NULL DEFAULT 'BANK',
    payment_date DATE NOT NULL,
    due_date DATE,
    reference_number VARCHAR(50),
    remarks TEXT,
    ledger_entry_id UUID REFERENCES ledger_entries(id) ON DELETE SET NULL,
    created_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_payments_tenant ON customer_payments(tenant_id);
CREATE INDEX idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX idx_customer_payments_invoice ON customer_payments(invoice_id);
CREATE INDEX idx_customer_payments_order ON customer_payments(order_id);

-- ZATCA settings table for tenant configuration
CREATE TABLE IF NOT EXISTS tenant_zatca_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE RESTRICT,
    seller_name VARCHAR(200) NOT NULL,
    vat_number VARCHAR(30) NOT NULL,
    street VARCHAR(200),
    city VARCHAR(100),
    branch_name VARCHAR(100),
    building_number VARCHAR(20),
    additional_number VARCHAR(20),
    district VARCHAR(100),
    zip_code VARCHAR(10),
    env VARCHAR(20) NOT NULL DEFAULT 'sandbox', -- sandbox | simulation | production
    binary_token TEXT, -- encrypted
    secret TEXT, -- encrypted
    binary_token_updated_at TIMESTAMP,
    secret_updated_at TIMESTAMP,
    configured BOOLEAN NOT NULL DEFAULT FALSE,
    last_tested_at TIMESTAMP,
    last_test_result JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_zatca_settings_tenant ON tenant_zatca_settings(tenant_id);