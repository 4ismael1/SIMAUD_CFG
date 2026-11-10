ALTER TABLE users ADD COLUMN signature_style jsonb;
ALTER TABLE contracts
  ADD COLUMN verification_code text UNIQUE,
  ADD COLUMN document_sha256 text,
  ADD COLUMN activated_at timestamptz,
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN system_seal jsonb,
  ADD COLUMN audit_head text,
  ADD COLUMN audit_count integer NOT NULL DEFAULT 0,
  ADD COLUMN evidence_head text,
  ADD COLUMN evidence_count integer NOT NULL DEFAULT 0,
  ADD COLUMN ever_signed boolean NOT NULL DEFAULT false;
UPDATE contracts c SET ever_signed=true WHERE EXISTS (
  SELECT 1 FROM contract_signatories s WHERE s.contract_id=c.id AND (s.status='signed' OR s.signed_at IS NOT NULL OR s.signature_path IS NOT NULL)
) OR EXISTS (SELECT 1 FROM files f WHERE f.contract_id=c.id AND f.kind='signature');
ALTER TABLE contract_audit_logs
  ADD COLUMN chain_contract_id uuid,
  ADD COLUMN sequence integer,
  ADD COLUMN entry_hash text,
  ADD COLUMN previous_hash text;
CREATE UNIQUE INDEX audit_chain_sequence ON contract_audit_logs(chain_contract_id, sequence);
CREATE TABLE signature_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE RESTRICT,
  signatory_id uuid NOT NULL,
  contract_version integer NOT NULL,
  sequence integer NOT NULL,
  payload jsonb NOT NULL,
  previous_evidence_hash text,
  evidence_hash text NOT NULL,
  UNIQUE(contract_id, sequence),
  UNIQUE(signatory_id, contract_version)
);
CREATE TABLE storage_migration_failures (
  job_id uuid NOT NULL REFERENCES job_runs(id) ON DELETE CASCADE,
  key text NOT NULL,
  reason text NOT NULL,
  PRIMARY KEY(job_id, key)
);
--> statement-breakpoint
CREATE FUNCTION t10_audit_hash(payload jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT encode(sha256(convert_to((
   (payload - ARRAY['entry_hash','previous_hash','contract_id','expected_sequence','expected_previous'])
   || jsonb_build_object('previous_hash', payload->'previous_hash',
     'created_at', extract(epoch from (payload->>'created_at')::timestamptz))
 )::text, 'UTF8')), 'hex')
$$;
--> statement-breakpoint
DO $$
DECLARE entry contract_audit_logs; previous text; counter integer; current_contract uuid;
BEGIN
 FOR current_contract IN SELECT DISTINCT contract_id FROM contract_audit_logs WHERE contract_id IS NOT NULL LOOP
   previous := NULL;
   counter := 0;
   FOR entry IN SELECT * FROM contract_audit_logs WHERE contract_id=current_contract ORDER BY created_at,id LOOP
     counter := counter + 1;
     entry.chain_contract_id := current_contract;
     entry.sequence := counter;
     entry.previous_hash := previous;
     entry.entry_hash := t10_audit_hash(to_jsonb(entry));
     UPDATE contract_audit_logs SET chain_contract_id=current_contract, sequence=counter,
       previous_hash=previous,entry_hash=entry.entry_hash WHERE id=entry.id;
     previous := entry.entry_hash;
   END LOOP;
   UPDATE contracts SET audit_head=previous,audit_count=counter WHERE id=current_contract;
 END LOOP;
END $$;
UPDATE contract_audit_logs l SET entry_hash=t10_audit_hash(to_jsonb(l)) WHERE chain_contract_id IS NULL;
--> statement-breakpoint
CREATE FUNCTION t10_chain_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head text; counter integer;
BEGIN
 IF NEW.contract_id IS NOT NULL THEN
   SELECT audit_head,audit_count INTO head,counter FROM contracts WHERE id=NEW.contract_id FOR UPDATE;
   NEW.chain_contract_id := NEW.contract_id;
   NEW.sequence := counter + 1;
   NEW.previous_hash := head;
   NEW.entry_hash := t10_audit_hash(to_jsonb(NEW));
   UPDATE contracts SET audit_head=NEW.entry_hash,audit_count=NEW.sequence WHERE id=NEW.contract_id;
 ELSE
   NEW.entry_hash := t10_audit_hash(to_jsonb(NEW));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t10_chain_audit BEFORE INSERT ON contract_audit_logs FOR EACH ROW EXECUTE FUNCTION t10_chain_audit();
--> statement-breakpoint
CREATE FUNCTION t10_revoke_seal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='cancelled' AND OLD.signed_pdf_path IS NOT NULL THEN
   NEW.revoked_at := coalesce(OLD.revoked_at, now());
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t10_revoke_seal BEFORE UPDATE OF status ON contracts FOR EACH ROW EXECUTE FUNCTION t10_revoke_seal();
--> statement-breakpoint
CREATE FUNCTION t10_remember_signature() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='signed' OR NEW.signed_at IS NOT NULL OR NEW.signature_path IS NOT NULL THEN
   UPDATE contracts SET ever_signed=true WHERE id=NEW.contract_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t10_remember_signature AFTER INSERT OR UPDATE OF status,signed_at,signature_path ON contract_signatories FOR EACH ROW EXECUTE FUNCTION t10_remember_signature();
