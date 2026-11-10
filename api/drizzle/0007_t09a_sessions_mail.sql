ALTER TABLE users ADD COLUMN credentials_version integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX refresh_active_family_idx ON refresh_tokens (family_id, user_id, expires_at) WHERE revoked_at IS NULL;
--> statement-breakpoint
ALTER TABLE email_outbox ADD COLUMN encrypted_payload text;
--> statement-breakpoint
ALTER TABLE email_outbox ADD COLUMN expires_at timestamptz;
--> statement-breakpoint
-- Legacy queued auth links were plaintext: invalidate them rather than retaining secrets.
UPDATE auth_tokens SET used_at = now() WHERE used_at IS NULL;
--> statement-breakpoint
UPDATE email_outbox SET payload = '{}'::jsonb, status = 'failed', last_error = 'Enlace invalidado por actualización de seguridad.' WHERE payload ? 'token';
--> statement-breakpoint
UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL;
