CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."auth_token_type" AS ENUM('email_confirmation', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."cancellation_reason" AS ENUM('breach', 'mutual_agreement', 'client_request', 'payment_default', 'other');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'pending_approval', 'rejected', 'pending_signatures', 'active', 'expiring_soon', 'expired', 'cancelled', 'renewed');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."renewal_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."signatory_role" AS ENUM('client', 'witness', 'contractor');--> statement-breakpoint
CREATE TYPE "public"."signatory_status" AS ENUM('pending', 'signed', 'declined');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'supervisor', 'gestor', 'user');--> statement-breakpoint
CREATE TYPE "public"."variable_type" AS ENUM('text', 'date', 'number', 'select', 'textarea');--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "auth_token_type" NOT NULL,
	"token_hash" text NOT NULL,
	"email" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "contract_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"comments" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"old_values" jsonb,
	"new_values" jsonb,
	"user_id" uuid,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_cancellations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" "cancellation_reason" NOT NULL,
	"description" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_renewals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_contract_id" uuid NOT NULL,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "renewal_status" DEFAULT 'pending' NOT NULL,
	"proposed_changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proposed_start_date" date,
	"proposed_end_date" date,
	"proposed_value" numeric(15, 2),
	"gestor_response" text,
	"processed_by" uuid,
	"processed_at" timestamp with time zone,
	"new_contract_id" uuid,
	"escalated_at" timestamp with time zone,
	"escalated_to" uuid,
	"escalation_reason" text,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"auto_renewal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_signatories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"cedula" text,
	"user_id" uuid,
	"role" "signatory_role" NOT NULL,
	"status" "signatory_status" DEFAULT 'pending' NOT NULL,
	"signing_order" integer DEFAULT 1 NOT NULL,
	"signature_path" text,
	"signed_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signing_order_positive" CHECK ("contract_signatories"."signing_order" > 0)
);
--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"variables" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "template_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content" text NOT NULL,
	"generated_content" text,
	"variables_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"change_summary" text
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"generated_content" text,
	"variables_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"client_name" text,
	"client_email" text,
	"client_phone" text,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"current_version" integer DEFAULT 1 NOT NULL,
	"contract_value" numeric(15, 2),
	"currency" text DEFAULT 'DOP' NOT NULL,
	"start_date" date,
	"end_date" date,
	"parent_contract_id" uuid,
	"renewal_type" text DEFAULT 'original' NOT NULL,
	"auto_renewal" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_dates" CHECK ("contracts"."end_date" IS NULL OR "contracts"."start_date" IS NULL OR "contracts"."end_date" >= "contracts"."start_date"),
	CONSTRAINT "contracts_version_positive" CHECK ("contracts"."current_version" > 0),
	CONSTRAINT "contracts_renewal_type" CHECK ("contracts"."renewal_type" IN ('original','manual_renewal','auto_renewal'))
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"mime" text NOT NULL,
	"size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_path_unique" UNIQUE("path"),
	CONSTRAINT "files_kind_check" CHECK ("files"."kind" IN ('avatar','signature','export')),
	CONSTRAINT "files_size_positive" CHECK ("files"."size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"expires_at" timestamp with time zone,
	"action_url" text,
	"action_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" IN ('contract_expiring','renewal_request','approval_needed','contract_signed','contract_cancelled','renewal_approved','renewal_rejected','approval_result','signature_required'))
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "template_variables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"type" "variable_type" NOT NULL,
	"options" text[],
	"required" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_variables_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"cedula" text DEFAULT '' NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"avatar_path" text,
	"pending_email" text,
	"email_confirmed_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_lower" CHECK ("users"."email" = lower(trim("users"."email")))
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_approvals" ADD CONSTRAINT "contract_approvals_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_approvals" ADD CONSTRAINT "contract_approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_approvals" ADD CONSTRAINT "contract_approvals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_audit_logs" ADD CONSTRAINT "contract_audit_logs_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_audit_logs" ADD CONSTRAINT "contract_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_cancellations" ADD CONSTRAINT "contract_cancellations_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_cancellations" ADD CONSTRAINT "contract_cancellations_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_cancellations" ADD CONSTRAINT "contract_cancellations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_original_contract_id_contracts_id_fk" FOREIGN KEY ("original_contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_new_contract_id_contracts_id_fk" FOREIGN KEY ("new_contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_escalated_to_users_id_fk" FOREIGN KEY ("escalated_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signatories" ADD CONSTRAINT "contract_signatories_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signatories" ADD CONSTRAINT "contract_signatories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_parent_contract_id_contracts_id_fk" FOREIGN KEY ("parent_contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_refresh_tokens_id_fk" FOREIGN KEY ("replaced_by") REFERENCES "public"."refresh_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_user_type_idx" ON "auth_tokens" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "approvals_contract_idx" ON "contract_approvals" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "contract_approvals" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_pending_unique" ON "contract_approvals" USING btree ("contract_id") WHERE "contract_approvals"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "audit_contract_created_idx" ON "contract_audit_logs" USING btree ("contract_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "contract_audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "cancellations_contract_idx" ON "contract_cancellations" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "cancellations_status_idx" ON "contract_cancellations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "renewals_requester_idx" ON "contract_renewals" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "renewals_status_idx" ON "contract_renewals" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "renewals_pending_unique" ON "contract_renewals" USING btree ("original_contract_id") WHERE "contract_renewals"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "signatory_contract_idx" ON "contract_signatories" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "signatory_user_status_idx" ON "contract_signatories" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "templates_status_idx" ON "contract_templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "templates_creator_idx" ON "contract_templates" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "versions_contract_number_unique" ON "contract_versions" USING btree ("contract_id","version_number");--> statement-breakpoint
CREATE INDEX "contracts_status_idx" ON "contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contracts_creator_idx" ON "contracts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "contracts_end_idx" ON "contracts" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "contracts_archived_idx" ON "contracts" USING btree ("archived");--> statement-breakpoint
CREATE INDEX "contracts_parent_idx" ON "contracts" USING btree ("parent_contract_id");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "refresh_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_cedula_unique" ON "users" USING btree ("cedula") WHERE "users"."cedula" <> '';--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at");