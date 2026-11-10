ALTER TABLE contracts ADD COLUMN original_created_by uuid;
ALTER TABLE contract_approvals ADD COLUMN original_requested_by uuid;
ALTER TABLE contract_renewals ADD COLUMN original_requested_by uuid;
--> statement-breakpoint
-- Prefer the first version/audit over the currently assigned manager.
UPDATE contracts c SET original_created_by = coalesce(
  (SELECT r.requested_by FROM contract_renewals r WHERE r.new_contract_id = c.id ORDER BY r.requested_at, r.id LIMIT 1),
  (SELECT v.created_by FROM contract_versions v WHERE v.contract_id = c.id AND v.version_number = 1),
  (SELECT l.user_id FROM contract_audit_logs l WHERE l.chain_contract_id = c.id AND l.action = 'create' ORDER BY l.created_at, l.id LIMIT 1),
  (SELECT nullif(l.old_values->>'managerId', '')::uuid FROM contract_audit_logs l WHERE l.chain_contract_id = c.id AND l.action = 'manager_reassigned' ORDER BY l.created_at, l.id LIMIT 1),
  c.created_by
);
UPDATE contract_approvals SET original_requested_by = requested_by;
UPDATE contract_renewals SET original_requested_by = requested_by;
--> statement-breakpoint
CREATE FUNCTION t16_preserve_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'contracts' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.original_created_by := coalesce(NEW.original_created_by, NEW.created_by);
    ELSIF NEW.original_created_by IS DISTINCT FROM OLD.original_created_by THEN
      RAISE EXCEPTION 'Contract origin is immutable';
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      NEW.original_requested_by := NEW.requested_by;
    ELSIF NEW.original_requested_by IS DISTINCT FROM OLD.original_requested_by THEN
      RAISE EXCEPTION 'Request origin is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER t16_contract_origin BEFORE INSERT OR UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION t16_preserve_origin();
CREATE TRIGGER t16_approval_origin BEFORE INSERT OR UPDATE ON contract_approvals FOR EACH ROW EXECUTE FUNCTION t16_preserve_origin();
CREATE TRIGGER t16_renewal_origin BEFORE INSERT OR UPDATE ON contract_renewals FOR EACH ROW EXECUTE FUNCTION t16_preserve_origin();
--> statement-breakpoint
CREATE INDEX contracts_signed_pdf_hash_idx ON contracts (signed_pdf_sha256) WHERE signed_pdf_sha256 IS NOT NULL;
--> statement-breakpoint
CREATE TABLE auth_request_budgets (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_request_budgets_expiry_idx ON auth_request_budgets (expires_at);
