-- Optional caller-provided idempotency key for ZATCA invoice retries.
-- Existing rows with NULL keys are unaffected. Duplicate non-null keys abort
-- this migration so they must be reconciled before production rollout.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "zatca_documents"
    WHERE "idempotency_key" IS NOT NULL
    GROUP BY "tenant_id", "idempotency_key"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'ZATCA duplicate tenant_id/idempotency_key rows detected; reconcile before applying 0017';
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX "zatca_documents_tenant_idempotency_unique"
  ON "zatca_documents" USING btree ("tenant_id", "idempotency_key");
