ALTER TABLE users ADD COLUMN invited_at timestamptz;
CREATE TABLE admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_id uuid,
  actor_name text NOT NULL,
  area text NOT NULL CHECK (area IN ('users','settings','templates','variables','storage','auth')),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  target_label text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  ip text,
  sequence integer NOT NULL DEFAULT 0 UNIQUE,
  entry_hash text NOT NULL DEFAULT '',
  previous_hash text
);
CREATE INDEX admin_audit_at_idx ON admin_audit_logs(at, id);
CREATE INDEX admin_audit_actor_idx ON admin_audit_logs(actor_id, at);
CREATE INDEX admin_audit_area_action_idx ON admin_audit_logs(area, action, at);
CREATE TABLE admin_audit_head (
  id integer PRIMARY KEY CHECK (id = 1),
  sequence integer NOT NULL DEFAULT 0,
  entry_hash text
);
INSERT INTO admin_audit_head (id) VALUES (1);
--> statement-breakpoint
CREATE FUNCTION t12b_audit_hash(payload jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT encode(sha256(convert_to(((payload - 'entry_hash') ||
   jsonb_build_object('at', extract(epoch from (payload->>'at')::timestamptz)))::text, 'UTF8')), 'hex')
$$;
--> statement-breakpoint
CREATE FUNCTION t12b_chain_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head admin_audit_head;
BEGIN
 SELECT * INTO head FROM admin_audit_head WHERE id=1 FOR UPDATE;
 NEW.sequence := head.sequence + 1;
 NEW.previous_hash := head.entry_hash;
 NEW.entry_hash := t12b_audit_hash(to_jsonb(NEW));
 UPDATE admin_audit_head SET sequence=NEW.sequence, entry_hash=NEW.entry_hash WHERE id=1;
 RETURN NEW;
END $$;
CREATE TRIGGER t12b_chain_audit BEFORE INSERT ON admin_audit_logs FOR EACH ROW EXECUTE FUNCTION t12b_chain_audit();
--> statement-breakpoint
CREATE FUNCTION t12b_immutable_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'El registro de auditoría es inmutable';
END $$;
CREATE TRIGGER t12b_immutable_audit BEFORE UPDATE OR DELETE ON admin_audit_logs FOR EACH ROW EXECUTE FUNCTION t12b_immutable_audit();
