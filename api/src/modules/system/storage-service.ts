import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { pool, db } from "../../db/client.js";
import { audit, type AuditEntry } from "../../lib/audit.js";
import {
  createDriver,
  publicConfig,
  readStorageState,
  resolveConfig,
  saveStorageState,
  sameStorageLocation,
  type StorageInput,
} from "../../lib/storage-config.js";
import { StorageError, storageBusy, type StorageDriver } from "../../lib/storage-types.js";
import { withStorageLock } from "../../lib/storage.js";
import { storageReferences } from "./storage-references.js";

export type StorageActor = Pick<AuditEntry, "userId" | "ip" | "userAgent">;
export async function getStorage() {
  const state = await readStorageState();
  return {
    ...publicConfig(state.active),
    pending: state.pending ? publicConfig(state.pending) : null,
    migrating: state.migrating,
  };
}

export async function withConfigurationLock<T>(operation: () => Promise<T>) {
  const client = await pool.connect();
  let locked = false;
  try {
    const result = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock(10411) locked",
    );
    locked = result.rows[0]!.locked;
    if (!locked) throw storageBusy();
    return await withStorageLock(operation);
  } finally {
    try {
      if (locked) await client.query("select pg_advisory_unlock(10411)");
    } finally {
      client.release();
    }
  }
}

export async function probeStorage(driver: StorageDriver) {
  const start = performance.now();
  const key = "storage-test/" + randomUUID();
  const bytes = randomBytes(64);
  const steps: { name: string; ok: boolean; message: string }[] = [];
  let step = "put";
  let written = false;
  try {
    await driver.put(key, bytes, { contentType: "application/octet-stream" });
    written = true;
    steps.push({ name: step, ok: true, message: "Objeto temporal escrito." });
    step = "get";
    const received = await driver.get(key);
    steps.push({ name: step, ok: true, message: "Objeto temporal leído." });
    step = "compare";
    if (!bytes.equals(received))
      throw new StorageError("unreachable", "Los bytes leídos no coinciden con los enviados.");
    steps.push({ name: step, ok: true, message: "Contenido verificado." });
  } catch (error) {
    steps.push({
      name: step,
      ok: false,
      message:
        error instanceof StorageError
          ? error.message
          : "No se pudo acceder al almacenamiento. Revisa permisos y conectividad.",
    });
  }
  if (written) {
    try {
      await driver.delete(key);
      steps.push({ name: "delete", ok: true, message: "Objeto temporal movido a papelera." });
    } catch (error) {
      steps.push({
        name: "delete",
        ok: false,
        message:
          error instanceof StorageError ? error.message : "No se pudo eliminar el objeto temporal.",
      });
    }
  }
  return {
    ok: steps.length === 4 && steps.every((item) => item.ok),
    latencyMs: Math.round(performance.now() - start),
    steps,
  };
}

export async function testStorage(input: StorageInput) {
  return withConfigurationLock(async () => probeStorage(createDriver(await resolveConfig(input))));
}

export async function updateStorage(input: StorageInput, actor: StorageActor) {
  return withConfigurationLock(async () => {
    const target = await resolveConfig(input);
    const test = await probeStorage(createDriver(target));
    if (!test.ok)
      throw new StorageError("unreachable", test.steps.find((step) => !step.ok)!.message);
    const state = await readStorageState();
    const needsMigration =
      !sameStorageLocation(state.active, target) && (await storageReferences()).length > 0;
    const retired = (state.retired ?? []).filter((config) => !sameStorageLocation(config, target));
    const next = needsMigration
      ? { active: state.active, pending: target, migrating: false, retired }
      : {
          active: target,
          migrating: false,
          retired: sameStorageLocation(state.active, target) ? retired : [...retired, state.active],
        };
    await db.transaction(async (tx) => {
      await saveStorageState(next, tx);
      await audit(tx, {
        ...actor,
        action: "storage:configure",
        entityType: "storage",
        oldValues: { driver: state.active.driver },
        newValues: { driver: target.driver, pendingMigration: needsMigration },
      });
    });
    return getStorage();
  });
}
