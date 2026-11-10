-- Preserve the original evidence; no signatory, signature or document is deleted.
CREATE TABLE contract_signatory_binding_review (
  signatory_id uuid PRIMARY KEY,
  contract_id uuid NOT NULL,
  original_user_id uuid NOT NULL,
  reason text NOT NULL,
  original_signatory jsonb NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
--> statement-breakpoint
INSERT INTO contract_signatory_binding_review
  (signatory_id, contract_id, original_user_id, reason, original_signatory)
SELECT s.id, s.contract_id, s.user_id,
  CASE WHEN count(*) OVER (PARTITION BY s.contract_id, s.user_id) > 1
    THEN 'duplicate_contract_user' ELSE 'unverified_or_different_email' END,
  to_jsonb(s)
FROM contract_signatories s
LEFT JOIN users u ON u.id = s.user_id
WHERE s.user_id IS NOT NULL AND (
  u.id IS NULL OR u.email_confirmed_at IS NULL
  OR lower(btrim(s.email)) <> lower(btrim(u.email))
  OR EXISTS (SELECT 1 FROM contract_signatories other
    WHERE other.contract_id = s.contract_id AND other.user_id = s.user_id AND other.id <> s.id)
);
--> statement-breakpoint
-- Quarantine access, retaining the complete original binding in the review report.
UPDATE contract_signatories s SET user_id = NULL
FROM contract_signatory_binding_review r WHERE r.signatory_id = s.id;
--> statement-breakpoint
CREATE UNIQUE INDEX signatories_contract_user_unique
  ON contract_signatories (contract_id, user_id) WHERE user_id IS NOT NULL;
--> statement-breakpoint
-- Existing versions can only be backfilled from today's catalog, not reconstructed history.
UPDATE contract_versions v SET snapshot = v.snapshot || jsonb_build_object(
  'variableDefinitions', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('name', d.name, 'type', d.type,
      'required', d.required, 'options', d.options) ORDER BY d.name)
    FROM template_variables d
    WHERE d.name IN (SELECT match[1] FROM regexp_matches(v.content, '{{\s*([a-z][a-z0-9_]*)\s*}}', 'g') AS match)
  ), '[]'::jsonb),
  'variableDefinitionsSource', 'migration_current_catalog',
  'missingVariableDefinitions', COALESCE((
    SELECT jsonb_agg(DISTINCT match[1])
    FROM regexp_matches(v.content, '{{\s*([a-z][a-z0-9_]*)\s*}}', 'g') AS match
    WHERE NOT EXISTS (SELECT 1 FROM template_variables d WHERE d.name = match[1])
  ), '[]'::jsonb)
) WHERE NOT (v.snapshot ? 'variableDefinitions');
