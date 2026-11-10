ALTER TABLE contract_signatories ADD COLUMN placement jsonb;
--> statement-breakpoint
ALTER TABLE signature_evidence DROP CONSTRAINT signature_evidence_signatory_id_contract_version_key;
--> statement-breakpoint
CREATE INDEX evidence_signatory_version ON signature_evidence (signatory_id, contract_version);
--> statement-breakpoint
CREATE TABLE verification_codes (
  code text PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  legacy boolean NOT NULL DEFAULT false,
  revoked boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE INDEX verification_codes_contract_idx ON verification_codes(contract_id);
--> statement-breakpoint
INSERT INTO verification_codes (code, contract_id, legacy)
SELECT replace(upper(verification_code), '-', ''), id, true FROM contracts WHERE verification_code IS NOT NULL;
