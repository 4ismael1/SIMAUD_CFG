-- Copias que el sistema entrega con marcas (estado «CANCELADO», «VENCIDO»… o copia de verificación).
-- Su huella no coincide con el PDF original firmado; registrarla permite reconocerlas al verificar.
CREATE TABLE "issued_copies" (
  "sha256" text PRIMARY KEY NOT NULL,
  "contract_id" uuid NOT NULL REFERENCES "contracts"("id") ON DELETE CASCADE,
  "kind" text NOT NULL CHECK ("kind" IN ('status', 'verification')),
  "stamp" text,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "issued_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX "issued_copies_contract_idx" ON "issued_copies" ("contract_id");
