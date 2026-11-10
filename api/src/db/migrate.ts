import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath, pathToFileURL } from "node:url";
import { db, pool } from "./client.js";
export async function migrateDatabase() {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await migrateDatabase();
    console.log("Migraciones aplicadas.");
  } catch {
    console.error("No se pudieron aplicar las migraciones; comprueba la conexión PostgreSQL.");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
