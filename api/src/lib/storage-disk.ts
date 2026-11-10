import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, rename, rm, link, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  StorageError,
  storageDateTimestamp,
  trashDate,
  validateKey,
  type StorageDriver,
} from "./storage-types.js";
import { decryptFile, encryptFile } from "./storage-encryption.js";

export const storageDirectory = path.resolve("storage");
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

async function permissions(filename: string, mode: number) {
  if (process.platform !== "win32") await chmod(filename, mode);
}

async function createDirectory(directory: string) {
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const entry = await lstat(directory);
  if (entry.isSymbolicLink() || !entry.isDirectory())
    throw new StorageError("invalid", "Storage contiene un enlace o una carpeta inválida.");
}

async function syncDirectory(directory: string) {
  if (process.platform === "win32") return;
  const handle = await open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function checkStorageRoot(root: string, create: boolean) {
  let current = path.resolve(root);
  // Check ancestors too, so a symlink replacing storage itself is rejected.
  const ancestors = [current];
  while (path.dirname(current) !== current) {
    current = path.dirname(current);
    ancestors.unshift(current);
  }
  for (const ancestor of ancestors) {
    try {
      const entry = await lstat(ancestor);
      if (entry.isSymbolicLink() || !entry.isDirectory())
        throw new StorageError("invalid", "Storage contiene un enlace o una carpeta inválida.");
    } catch (error) {
      if (!missing(error) || !create) throw error;
      await createDirectory(ancestor);
    }
  }
  await permissions(root, 0o700);
}

export class DiskStorage implements StorageDriver {
  constructor(readonly root = storageDirectory) {}

  private async safePath(key: string, create = false) {
    const parts = key.split("/");
    await checkStorageRoot(this.root, create);
    let current = path.resolve(this.root);
    for (const [index, part] of parts.entries()) {
      current = path.join(current, part);
      try {
        const entry = await lstat(current);
        if (
          entry.isSymbolicLink() ||
          (index < parts.length - 1 && !entry.isDirectory()) ||
          (index === parts.length - 1 && !entry.isFile())
        )
          throw new StorageError("invalid", "Storage contiene un enlace o un archivo inválido.");
      } catch (error) {
        if (!missing(error)) throw error;
        if (index < parts.length - 1 && create) await createDirectory(current);
        else if (index < parts.length - 1) throw error;
      }
      if (index < parts.length - 1) await permissions(current, 0o700);
    }
    return current;
  }

  async put(key: string, bytes: Buffer, _options: { contentType: string }) {
    validateKey(key);
    const filename = await this.safePath(key, true);
    const temporary = path.join(path.dirname(filename), ".tmp-" + randomUUID());
    const file = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      try {
        await file.writeFile(encryptFile(key, bytes));
        await file.sync();
      } finally {
        await file.close();
      }
      await this.safePath(key);
      // Publish a complete inode without replacing an immutable existing object.
      await link(temporary, filename);
      await syncDirectory(path.dirname(filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new StorageError("conflict", "El archivo ya existe.");
      throw error;
    } finally {
      await unlink(temporary);
    }
  }

  async get(key: string) {
    validateKey(key);
    try {
      const filename = await this.safePath(key);
      const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        return decryptFile(key, await file.readFile());
      } finally {
        await file.close();
      }
    } catch (error) {
      if (missing(error)) throw new StorageError("missing", "No se encontró el archivo.");
      throw error;
    }
  }

  async exists(key: string) {
    try {
      await this.get(key);
      return true;
    } catch (error) {
      if (error instanceof StorageError && error.reason === "missing") return false;
      throw error;
    }
  }

  async delete(key: string, today = new Date().toISOString().slice(0, 10)) {
    validateKey(key);
    trashDate(today);
    try {
      const source = await this.safePath(key);
      const target = await this.safePath(".trash/" + today + "/" + key, true);
      await rename(source, target);
      await syncDirectory(path.dirname(target));
    } catch (error) {
      // Retrying a move after success is harmless.
      if (!missing(error)) throw error;
    }
  }

  async list(prefix = "") {
    if (prefix) validateKey(prefix.replace(/\/$/, ""));
    const found: string[] = [];
    const walk = async (directory: string, relative: string) => {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink())
          throw new StorageError("invalid", "Storage contiene un enlace.");
        if (entry.name.startsWith(".")) continue;
        const key = relative + entry.name;
        if (entry.isDirectory()) await walk(path.join(directory, entry.name), key + "/");
        else if (key.startsWith(prefix)) found.push(key);
      }
    };
    try {
      await this.safePath("probe", true);
      await walk(this.root, "");
    } catch (error) {
      if (!missing(error)) throw error;
    }
    return found;
  }

  async purge(today: string) {
    const cutoff = Date.parse(trashDate(today) + "T00:00:00Z") - 8 * 86400000;
    let count = 0;
    try {
      const probe = await this.safePath(".trash/probe");
      for (const entry of await readdir(path.dirname(probe), { withFileTypes: true })) {
        if (entry.isSymbolicLink())
          throw new StorageError("invalid", "La papelera contiene un enlace.");
        const timestamp = storageDateTimestamp(entry.name);
        if (!entry.isDirectory() || !Number.isFinite(timestamp) || timestamp >= cutoff) continue;
        await rm(path.join(this.root, ".trash", entry.name), { recursive: true });
        count++;
      }
    } catch (error) {
      if (!missing(error)) throw error;
    }
    return count;
  }
}
