ALTER TABLE contract_templates ADD COLUMN content_format text NOT NULL DEFAULT 'plain';
--> statement-breakpoint
ALTER TABLE contract_templates ADD CONSTRAINT templates_content_format CHECK (content_format IN ('plain','rich-v1'));
--> statement-breakpoint
ALTER TABLE contracts ADD COLUMN content_format text NOT NULL DEFAULT 'plain';
--> statement-breakpoint
ALTER TABLE contracts ADD CONSTRAINT contracts_content_format CHECK (content_format IN ('plain','rich-v1'));
--> statement-breakpoint
ALTER TABLE contract_versions ADD COLUMN content_format text NOT NULL DEFAULT 'plain';
--> statement-breakpoint
ALTER TABLE contract_versions ADD CONSTRAINT versions_content_format CHECK (content_format IN ('plain','rich-v1'));
