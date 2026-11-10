import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { pool } from "../db/client.js";
import { createDriver, readStorageState, sameStorageLocation } from "./storage-config.js";
import { DiskStorage, storageDirectory } from "./storage-disk.js";
import { storageBusy, validateKey, type StorageDriver } from "./storage-types.js";
import { ApiError } from "./errors.js";
import { AdmissionQueue } from "./admission-queue.js";
import type { FastifyReply, FastifyRequest } from "fastify";
export { storageDirectory };
export type { StorageDriver } from "./storage-types.js";
const mutationDriver = new AsyncLocalStorage<StorageDriver>();
const mutations = new AdmissionQueue(8);

export async function withStorageLock<T>(operation: () => Promise<T>) {
  const client = await pool.connect();
  try {
    // backup.sh holds the same session lock throughout pg_dump and tar.
    await client.query("set lock_timeout = '5s'");
    try {
      await client.query("select pg_advisory_lock(10409)");
    } catch (error) {
      if ((error as { code?: string }).code === "55P03")
        throw new ApiError(503, "RATE_LIMITED", "Almacenamiento ocupado, inténtalo de nuevo");
      throw error;
    }
    return await operation();
  } finally {
    try {
      await client.query("select pg_advisory_unlock(10409)");
      await client.query("reset lock_timeout");
    } finally {
      client.release();
    }
  }
}

export async function withStorageMutation<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (mutationDriver.getStore()) return operation();
  // Reserve pool capacity for the business transaction and the backup lock.
  const release = await mutations.acquire(signal);
  try {
    return await runStorageMutation(async () => {
      if (signal?.aborted) throw new ApiError(409, "CONFLICT", "La solicitud fue cancelada.");
      return operation();
    });
  } finally {
    release();
  }
}

export async function withRequestStorageMutation<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  operation: () => Promise<T>,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const close = () => {
    if (!reply.raw.writableFinished) abort();
  };
  request.raw.once("aborted", abort);
  reply.raw.once("close", close);
  if (request.raw.aborted) abort();
  try {
    return await withStorageMutation(operation, controller.signal);
  } finally {
    request.raw.removeListener("aborted", abort);
    reply.raw.removeListener("close", close);
  }
}

async function runStorageMutation<T>(operation: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let locked = false;
  try {
    const result = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock_shared(10411) locked",
    );
    locked = result.rows[0]!.locked;
    if (!locked) throw storageBusy();
    const state = await readStorageState();
    if (state.migrating) throw storageBusy();
    // The lease spans file publication, database commit and rollback cleanup.
    return await mutationDriver.run(createDriver(state.active), operation);
  } finally {
    try {
      if (locked) await client.query("select pg_advisory_unlock_shared(10411)");
    } finally {
      client.release();
    }
  }
}

async function activeDriver() {
  return mutationDriver.getStore() ?? createDriver((await readStorageState()).active);
}

export const storage: StorageDriver = {
  put: (key: string, bytes: Buffer, options: { contentType: string }) =>
    withStorageMutation(async () =>
      withStorageLock(async () => (await activeDriver()).put(validateKey(key), bytes, options)),
    ),
  get: async (key: string) => (await activeDriver()).get(validateKey(key)),
  exists: async (key: string) => (await activeDriver()).exists(validateKey(key)),
  delete: (key: string, today?: string) =>
    withStorageMutation(async () =>
      withStorageLock(async () => (await activeDriver()).delete(validateKey(key), today)),
    ),
  list: async (prefix?: string) => (await activeDriver()).list(prefix),
  purge: (today: string) => purgeTrash(today),
};

// Compatibility for T09b callers and restore tooling. Business modules use keys.
export async function trashFile(
  filename: string,
  today = new Date().toISOString().slice(0, 10),
  root = storageDirectory,
) {
  const relative = path.relative(root, filename).split(path.sep).join("/");
  validateKey(relative);
  return withStorageMutation(async () =>
    withStorageLock(() => new DiskStorage(root).delete(relative, today)),
  );
}

export async function purgeTrash(today: string, root?: string) {
  return withStorageMutation(async () =>
    withStorageLock(async () => {
      if (root) return new DiskStorage(root).purge(today);
      const active = await activeDriver();
      const local = await new DiskStorage().purge(today);
      let purged = active instanceof DiskStorage ? local : local + (await active.purge(today));
      const state = await readStorageState();
      for (const config of state.retired ?? []) {
        if (config.driver === "disk" || sameStorageLocation(config, state.active)) continue;
        purged += await createDriver(config).purge(today);
      }
      return purged;
    }),
  );
}
