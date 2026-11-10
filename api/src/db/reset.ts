import { sql } from "drizzle-orm";
import { env } from "../config/env.js";
import { db, pool } from "./client.js";
import { migrateDatabase } from "./migrate.js";
if (env.NODE_ENV === "production") {
  console.error("db:reset está prohibido en producción.");
  process.exitCode = 1;
} else {
  const target = new URL(env.NODE_ENV === "test" ? env.DATABASE_URL_TEST! : env.DATABASE_URL);
  if (!["/simaud_dev", "/simaud_test"].includes(target.pathname))
    throw new Error("db:reset solo permite simaud_dev o simaud_test");
  try {
    await db.execute(
      sql.raw(
        "DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;",
      ),
    );
    await migrateDatabase();
    console.log("Base reiniciada. Ejecuta npm run db:seed si deseas datos de ejemplo.");
  } finally {
    await pool.end();
  }
}
