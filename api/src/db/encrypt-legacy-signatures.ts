import { pathToFileURL } from "node:url";
import { pool } from "./client.js";
import { createDriver, readStorageState } from "../lib/storage-config.js";
import { withConfigurationLock } from "../modules/system/storage-service.js";
import { storageReferences } from "../modules/system/storage-references.js";

export async function encryptLegacySignatures(driverFactory = createDriver) {
  return withConfigurationLock(async () => {
    const state = await readStorageState();
    if (state.migrating)
      throw new Error("Detén o completa la migración de almacenamiento antes del backfill.");
    const driver = driverFactory(state.active);
    if (!driver.encryptLegacySignature) throw new Error("El driver no admite backfill cifrado.");
    const keys = await driver.list("signatures/");
    const references = new Map(
      (await storageReferences()).map((reference) => [reference.key, reference.sha256]),
    );
    let encrypted = 0;
    for (const key of keys)
      if (await driver.encryptLegacySignature(key, references.get(key) ?? undefined)) encrypted++;
    return { total: keys.length, encrypted, unchanged: keys.length - encrypted };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const summary = await encryptLegacySignatures();
    console.info("Backfill completado: " + JSON.stringify(summary));
  } catch {
    console.error(
      "Backfill interrumpido. El origen se conserva; revisa permisos, ETag y clave antes de reintentar.",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
