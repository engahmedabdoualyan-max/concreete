-- Optional caller-provided idempotency key for ZATCA invoice retries.
-- Existing rows with NULL keys are unaffected. Duplicate non-null keys abort
-- this migration so they must be reconciled before production rollout.
--
-- The column itself is created here. It was declared in `schema.ts` but no
-- migration had ever created it, so the guard below could not run and
-- `zatca.service.ts` failed with `column "idempotency_key" does not exist` on
-- every invoice insert. The ADD COLUMN is idempotent so re-running is safe.

ALTER TABLE "zatca_documents"
  ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(200);
--> statement-breakpoint
COMMENT ON COLUMN "zatca_documents"."idempotency_key"
  IS 'Caller-supplied key that makes an invoice request safe to retry; NULL means the request was not keyed.';
--> statement-breakpoint
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
CREATE UNIQUE INDEX IF NOT EXISTS "zatca_documents_tenant_idempotency_unique"
  ON "zatca_documents" USING btree ("tenant_id", "idempotency_key");