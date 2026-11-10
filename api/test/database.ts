import { sql } from "drizzle-orm";
import { db, pool } from "../src/db/client.js";
import { env } from "../src/config/env.js";
import { migrateDatabase } from "../src/db/migrate.js";
export { db, pool };
export function guardTestDatabase() {
  const target = new URL(env.DATABASE_URL_TEST),
    dev = new URL(env.DATABASE_URL);
  if (
    env.NODE_ENV !== "test" ||
    target.pathname !== "/simaud_test" ||
    (target.host === dev.host && target.pathname === dev.pathname)
  )
    throw new Error("Las pruebas solo pueden ejecutarse en simaud_test, separada de desarrollo.");
}
export async function prepareDatabase() {
  guardTestDatabase();
  await migrateDatabase();
}
export async function cleanDatabase() {
  guardTestDatabase();
  await db.execute(
    sql.raw(
      "TRUNCATE settings, job_runs, expiry_deliveries, users, refresh_tokens, auth_tokens, template_variables, contract_templates, contracts, contract_signatories, contract_versions, contract_approvals, contract_audit_logs, contract_renewals, contract_cancellations, notifications, files CASCADE",
    ),
  );
}
