-- ZATCA artifact immutability.
-- A final document is evidence: corrections must create a new credit/debit
-- note or a new invoice, never mutate the accepted artifact in place.

CREATE OR REPLACE FUNCTION fimto_block_zatca_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMMUTABLE_ZATCA_ARTIFACT: ZATCA documents cannot be deleted'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status IN ('CLEARED', 'REPORTED', 'REJECTED') AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
    OR NEW.invoice_uuid IS DISTINCT FROM OLD.invoice_uuid
    OR NEW.invoice_type IS DISTINCT FROM OLD.invoice_type
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.counter_value IS DISTINCT FROM OLD.counter_value
    OR NEW.invoice_hash IS DISTINCT FROM OLD.invoice_hash
    OR NEW.previous_hash IS DISTINCT FROM OLD.previous_hash
    OR NEW.qr_tlv_base64 IS DISTINCT FROM OLD.qr_tlv_base64
    OR NEW.totals IS DISTINCT FROM OLD.totals
    OR NEW.fatoora_response IS DISTINCT FROM OLD.fatoora_response
    OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
    OR NEW.cleared_at IS DISTINCT FROM OLD.cleared_at
    OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'IMMUTABLE_ZATCA_ARTIFACT: final ZATCA evidence cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_zatca_artifact_immutable_update ON zatca_documents;
DROP TRIGGER IF EXISTS trg_zatca_artifact_immutable_delete ON zatca_documents;
CREATE TRIGGER trg_zatca_artifact_immutable_update
BEFORE UPDATE ON zatca_documents
FOR EACH ROW EXECUTE FUNCTION fimto_block_zatca_artifact_mutation();
CREATE TRIGGER trg_zatca_artifact_immutable_delete
BEFORE DELETE ON zatca_documents
FOR EACH ROW EXECUTE FUNCTION fimto_block_zatca_artifact_mutation();
