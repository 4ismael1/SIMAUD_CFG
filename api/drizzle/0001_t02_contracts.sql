CREATE FUNCTION next_contract_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE y text := to_char(CURRENT_DATE, 'YYYY'); n bigint; seq text := 'contract_code_' || y;
BEGIN
 PERFORM pg_advisory_xact_lock(10403);
 EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', seq);
 EXECUTE format('SELECT nextval(%L)', seq) INTO n;
 RETURN 'CT-' || y || '-' || lpad(n::text, greatest(4,length(n::text)), '0');
END $$;
--> statement-breakpoint
ALTER TABLE "contract_signatories" ADD COLUMN "viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contract_signatories" ADD COLUMN "accepted_declaration_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contract_signatories" ADD COLUMN "last_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "code" text DEFAULT next_contract_code() NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "previous_status" "contract_status";--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_code_unique" UNIQUE("code");