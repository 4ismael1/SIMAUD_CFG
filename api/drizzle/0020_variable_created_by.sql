-- Who created each catalog variable (pilot mode: a supervisor edits or deletes only their own).
ALTER TABLE "template_variables" ADD COLUMN IF NOT EXISTS "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
