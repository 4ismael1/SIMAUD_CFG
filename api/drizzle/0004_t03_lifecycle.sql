CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"summary" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "signed_pdf_path" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "signed_pdf_sha256" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "expiry_contract_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "expiry_threshold" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notification_preferences" jsonb DEFAULT '{"emailOnSignatureRequired":true,"emailOnApprovalResult":true,"emailOnExpiry":true}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "job_runs_name_started_idx" ON "job_runs" USING btree ("name","started_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_expiry_contract_id_contracts_id_fk" FOREIGN KEY ("expiry_contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_expiry_unique" ON "notifications" USING btree ("expiry_contract_id","user_id","expiry_threshold");