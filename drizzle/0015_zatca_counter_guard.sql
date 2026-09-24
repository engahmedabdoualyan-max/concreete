-- ZATCA invoice counter safety.
-- Apply only after checking existing rows; the migration intentionally aborts
-- if legacy data already contains duplicate tenant/counter pairs.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "zatca_documents"
    GROUP BY "tenant_id", "counter_value"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'ZATCA duplicate tenant_id/counter_value rows detected; reconcile before applying 0015';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "zatca_documents"
    GROUP BY "tenant_id", "invoice_number"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'ZATCA duplicate tenant_id/invoice_number rows detected; reconcile before applying 0015';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "zatca_documents"
    GROUP BY "invoice_uuid"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'ZATCA duplicate invoice_uuid rows detected; reconcile before applying 0015';
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX "zatca_documents_tenant_invoice_number_unique"
  ON "zatca_documents" USING btree ("tenant_id", "invoice_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "zatca_documents_invoice_uuid_unique"
  ON "zatca_documents" USING btree ("invoice_uuid");
--> statement-breakpoint
CREATE UNIQUE INDEX "zatca_documents_tenant_counter_unique"
  ON "zatca_documents" USING btree ("tenant_id", "counter_value");
