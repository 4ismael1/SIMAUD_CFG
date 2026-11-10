import { sql } from "drizzle-orm";
import { db, pool } from "../src/db/client.js";
import { env } from "../src/config/env.js";
import { migrateDatabase } from "../src/db/migrate.js";
export { db, pool };
export function guardTestDatabase(config = env) {
  if (!config.DATABASE_URL_TEST) throw new Error("Falta DATABASE_URL_TEST para las pruebas.");
  const target = new URL(config.DATABASE_URL_TEST);
  const dev = new URL(config.DATABASE_URL);
  if (
    config.NODE_ENV !== "test" ||
    !decodeURIComponent(target.pathname).slice(1).startsWith("simaud_test") ||
    decodeURIComponent(target.pathname) === decodeURIComponent(dev.pathname)
  )
    throw new Error(
      "Las pruebas solo pueden ejecutarse en una BD con prefijo simaud_test, separada de desarrollo.",
    );
}
export async function prepareDatabase() {
  guardTestDatabase();
  await migrateDatabase();
}
export async function cleanDatabase() {
  guardTestDatabase();
  await db.execute(
    sql.raw(
      "TRUNCATE email_outbox, settings, job_runs, expiry_deliveries, users, refresh_tokens, auth_tokens, template_variables, contract_templates, contracts, contract_signatories, contract_versions, contract_approvals, contract_audit_logs, contract_renewals, contract_cancellations, notifications, files CASCADE",
    ),
  );
}
