-- A deleted account no longer holds its cédula: the person can register again with it.
DROP INDEX IF EXISTS "users_cedula_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "users_cedula_unique" ON "users" USING btree ("cedula") WHERE "users"."cedula" <> '' AND "users"."deleted_at" IS NULL;
