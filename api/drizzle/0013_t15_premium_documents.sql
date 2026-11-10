ALTER TABLE contract_templates DROP CONSTRAINT templates_content_format;
--> statement-breakpoint
ALTER TABLE contract_templates ADD CONSTRAINT templates_content_format CHECK (content_format IN ('plain','rich-v1','rich-v2'));
--> statement-breakpoint
ALTER TABLE contracts DROP CONSTRAINT contracts_content_format;
--> statement-breakpoint
ALTER TABLE contracts ADD CONSTRAINT contracts_content_format CHECK (content_format IN ('plain','rich-v1','rich-v2'));
--> statement-breakpoint
ALTER TABLE contract_versions DROP CONSTRAINT versions_content_format;
--> statement-breakpoint
ALTER TABLE contract_versions ADD CONSTRAINT versions_content_format CHECK (content_format IN ('plain','rich-v1','rich-v2'));
