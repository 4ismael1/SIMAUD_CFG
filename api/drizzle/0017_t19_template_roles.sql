ALTER TABLE users ADD COLUMN position text;
ALTER TABLE users ADD CONSTRAINT users_position_length CHECK (char_length(position) <= 120);
ALTER TABLE contract_signatories ADD COLUMN role_label text NOT NULL DEFAULT '';
ALTER TABLE contract_signatories ADD COLUMN slot_index integer;
--> statement-breakpoint
-- Preserve the historical PDF assignment, which used signing order even for witnesses.
WITH slots AS (
  SELECT c.id, row_number() OVER (PARTITION BY c.id ORDER BY block.ordinality, slot.ordinality) - 1 AS index,
    slot.value->'attrs'->>'label' AS label
  FROM contracts c
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN c.content_format = 'rich-v2' THEN c.content::jsonb->'content' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS block(value, ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN block.value->>'type' = 'signatures' THEN block.value->'content' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS slot(value, ordinality)
), ranked AS (
  SELECT id, contract_id, row_number() OVER (PARTITION BY contract_id ORDER BY signing_order, id) - 1 AS index
  FROM contract_signatories
)
UPDATE contract_signatories s SET slot_index = slots.index::int,
  role_label = coalesce(nullif(btrim(slots.label), ''),
    CASE s.role WHEN 'client' THEN 'Cliente' WHEN 'contractor' THEN 'Contratista' ELSE 'Testigo' END)
FROM ranked r JOIN slots ON slots.id = r.contract_id AND slots.index = r.index
WHERE s.id = r.id;
UPDATE contract_signatories SET role_label =
  CASE role WHEN 'client' THEN 'Cliente' WHEN 'contractor' THEN 'Contratista' ELSE 'Testigo' END
WHERE role_label = '';
--> statement-breakpoint
ALTER TABLE contract_signatories ADD CONSTRAINT signatory_slot_nonnegative CHECK (slot_index >= 0);
CREATE UNIQUE INDEX signatory_contract_slot_unique ON contract_signatories(contract_id, slot_index)
  WHERE slot_index IS NOT NULL;
--> statement-breakpoint
-- Older importers and fixtures can still insert using only the compatibility enum.
CREATE FUNCTION t19_default_role_label() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role_label = '' THEN
    NEW.role_label := CASE NEW.role WHEN 'client' THEN 'Cliente' WHEN 'contractor' THEN 'Contratista' ELSE 'Testigo' END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t19_default_role_label BEFORE INSERT OR UPDATE OF role_label ON contract_signatories
  FOR EACH ROW EXECUTE FUNCTION t19_default_role_label();
