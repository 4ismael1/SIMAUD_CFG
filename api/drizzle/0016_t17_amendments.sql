ALTER TYPE contract_status ADD VALUE 'amended';
--> statement-breakpoint
ALTER TABLE contracts ADD COLUMN ever_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN amends_contract_id uuid REFERENCES contracts(id) ON DELETE RESTRICT,
  ADD COLUMN amendment_root_id uuid REFERENCES contracts(id) ON DELETE RESTRICT,
  ADD COLUMN amended_by_contract_id uuid REFERENCES contracts(id) ON DELETE RESTRICT,
  ADD COLUMN amendment_number integer,
  ADD COLUMN amendment_sequence integer NOT NULL DEFAULT 0,
  ADD COLUMN amendment_reason text,
  ADD CONSTRAINT contracts_amendment_fields CHECK (
    (amends_contract_id IS NULL AND amendment_root_id IS NULL AND amendment_number IS NULL AND amendment_reason IS NULL)
    OR (amends_contract_id IS NOT NULL AND amendment_root_id IS NOT NULL
      AND amendment_number IS NOT NULL AND amendment_number > 0 AND amendment_reason IS NOT NULL
      AND length(trim(amendment_reason)) BETWEEN 1 AND 500 AND amends_contract_id <> id)
  );
--> statement-breakpoint
CREATE UNIQUE INDEX contracts_amendment_number ON contracts(amendment_root_id, amendment_number);
CREATE UNIQUE INDEX contracts_open_amendment ON contracts(amendment_root_id)
  WHERE status IN ('draft', 'rejected', 'pending_approval', 'pending_signatures');
CREATE INDEX contracts_amends_idx ON contracts(amends_contract_id);
--> statement-breakpoint
UPDATE contracts c SET ever_approved = true WHERE approved_at IS NOT NULL OR ever_signed
  OR signed_pdf_path IS NOT NULL OR system_seal IS NOT NULL
  OR status IN ('pending_signatures', 'active', 'expiring_soon', 'expired', 'renewed')
  OR EXISTS (SELECT 1 FROM signature_evidence e WHERE e.contract_id = c.id)
  OR EXISTS (SELECT 1 FROM contract_approvals a WHERE a.contract_id = c.id AND a.status = 'approved')
  OR EXISTS (SELECT 1 FROM contract_audit_logs a WHERE a.chain_contract_id = c.id
    AND (a.action IN ('approve', 'approved_own', 'sign') OR a.new_values->>'status' = 'pending_signatures'));
--> statement-breakpoint
CREATE FUNCTION t17_preserve_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.ever_approved THEN RAISE EXCEPTION 'Approved contracts must be retained'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN NEW.ever_approved := NEW.ever_approved OR OLD.ever_approved; END IF;
  NEW.ever_approved := NEW.ever_approved OR NEW.approved_at IS NOT NULL OR NEW.ever_signed
    OR NEW.signed_pdf_path IS NOT NULL OR NEW.status::text IN ('pending_signatures', 'active', 'expiring_soon', 'expired', 'renewed', 'amended');
  RETURN NEW;
END $$;
CREATE TRIGGER t17_preserve_approval BEFORE INSERT OR UPDATE OR DELETE ON contracts
  FOR EACH ROW EXECUTE FUNCTION t17_preserve_approval();
--> statement-breakpoint
CREATE FUNCTION t17_approval_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'approved' THEN UPDATE contracts SET ever_approved = true WHERE id = NEW.contract_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t17_approval_history AFTER INSERT OR UPDATE ON contract_approvals
  FOR EACH ROW EXECUTE FUNCTION t17_approval_history();
