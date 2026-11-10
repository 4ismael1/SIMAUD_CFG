import { mkdir, rename, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { pool } from "../db/client.js";

export const storageDirectory = path.resolve("storage");

export async function withStorageLock<T>(operation: () => Promise<T>) {
  const client = await pool.connect();
  try {
    // backup.sh holds this same session lock from before pg_dump until tar finishes.
    await client.query("select pg_advisory_lock(10409)");
    return await operation();
  } finally {
    try {
      await client.query("select pg_advisory_unlock(10409)");
    } finally {
      client.release();
    }
  }
}

export async function trashFile(
  filename: string,
  today = new Date().toISOString().slice(0, 10),
  root = storageDirectory,
) {
  const relative = path.relative(root, filename);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    relative.split(path.sep)[0] === ".trash" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(today)
  )
    throw new Error("Ruta de storage inválida.");
  return withStorageLock(async () => {
    const target = path.join(root, ".trash", today, relative);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await rename(filename, target);
    } catch (error) {
      // Retrying cleanup of an already moved file is harmless; other I/O failures matter.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  });
}

export async function purgeTrash(today: string, root = storageDirectory) {
  const cutoff = Date.parse(today + "T00:00:00Z") - 8 * 86400000;
  if (!Number.isFinite(cutoff)) throw new Error("Fecha de limpieza inválida.");
  return withStorageLock(async () => {
    const directory = path.join(root, ".trash");
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      },
    );
    let purged = 0;
    for (const entry of entries) {
      const timestamp = Date.parse(entry.name + "T00:00:00Z");
      if (
        !entry.isDirectory() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.name) ||
        !Number.isFinite(timestamp) ||
        timestamp >= cutoff
      )
        continue;
      await rm(path.join(directory, entry.name), { recursive: true });
      purged++;
    }
    return purged;
  });
}
