import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DiskStorage } from "../src/lib/storage-disk.js";

let root: string;
let driver: DiskStorage;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "simaud-t11-"));
  driver = new DiskStorage(path.join(root, "private"));
});
afterEach(async () => {
  expect(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)).toBe(true);
  await rm(root, { recursive: true, force: true });
});

it("publica bytes completos de forma atómica y conserva el archivo en escrituras concurrentes", async () => {
  const bytes = Buffer.alloc(1024 * 1024, 7);
  await driver.put("signatures/original.png", bytes, { contentType: "image/png" });
  const results = await Promise.allSettled([
    driver.put("signatures/collision.png", bytes, { contentType: "image/png" }),
    driver.put("signatures/collision.png", Buffer.from("otro"), { contentType: "image/png" }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(await driver.get("signatures/original.png")).toEqual(bytes);
  expect(
    (await readdir(path.join(driver.root, "signatures"))).some((name) => name.startsWith(".tmp")),
  ).toBe(false);
  await expect(
    driver.put("signatures/original.png", Buffer.from("cambio"), { contentType: "image/png" }),
  ).rejects.toThrow("existe");
  expect(await driver.get("signatures/original.png")).toEqual(bytes);
});

it("cifra firmas nuevas, detecta alteraciones y sigue leyendo evidencia histórica", async () => {
  const bytes = Buffer.from("private signature bytes");
  await driver.put("signatures/new.png", bytes, { contentType: "image/png" });
  const filename = path.join(driver.root, "signatures/new.png");
  const encrypted = await readFile(filename);
  expect(encrypted.includes(bytes)).toBe(false);
  expect(await driver.get("signatures/new.png")).toEqual(bytes);
  encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 1;
  await writeFile(filename, encrypted);
  await expect(driver.get("signatures/new.png")).rejects.toThrow("integridad");
  await writeFile(path.join(driver.root, "signatures/legacy.png"), bytes);
  expect(await driver.get("signatures/legacy.png")).toEqual(bytes);
});

it("rechaza traversal y rutas absolutas antes de leer o escribir", async () => {
  for (const key of [
    "../outside",
    "/etc/passwd",
    "C:/private",
    "a/../b",
    "a\\b",
    "a//b",
    ".trash/a",
    "a/./b",
    "a/%2e%2e/b",
  ]) {
    await expect(driver.put(key, Buffer.from("no"), { contentType: "text/plain" })).rejects.toThrow(
      "válida",
    );
    await expect(driver.get(key)).rejects.toThrow("válida");
    await expect(driver.delete(key)).rejects.toThrow("válida");
  }
});

it("rechaza un symlink en una carpeta y en el archivo final", async () => {
  await mkdir(driver.root);
  const outside = path.join(root, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "evidence"), "evidencia");
  await symlink(
    outside,
    path.join(driver.root, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(driver.get("linked/evidence")).rejects.toThrow("enlace");
  await expect(
    driver.put("linked/new", Buffer.from("no"), { contentType: "text/plain" }),
  ).rejects.toThrow("enlace");
  await expect(driver.delete("linked/evidence")).rejects.toThrow("enlace");
  expect(await readFile(path.join(outside, "evidence"), "utf8")).toBe("evidencia");
  // File symlinks need elevated Windows privileges. Directory junctions above run everywhere.
  if (process.platform === "win32") return;
  await symlink(path.join(outside, "evidence"), path.join(driver.root, "file"));
  await expect(driver.get("file")).rejects.toThrow("enlace");
});

it("mueve a papelera sin cambiar bytes y purga solo fechas con más de ocho días", async () => {
  await driver.put("avatars/old.png", Buffer.from("old"), { contentType: "image/png" });
  await driver.put("avatars/recent.png", Buffer.from("recent"), { contentType: "image/png" });
  await driver.delete("avatars/old.png", "2026-10-31");
  await driver.delete("avatars/old.png", "2026-10-31");
  await driver.delete("avatars/recent.png", "2026-11-01");
  await mkdir(path.join(driver.root, ".trash/2026-99-99"));
  expect(await driver.exists("avatars/old.png")).toBe(false);
  expect(
    await readFile(path.join(driver.root, ".trash/2026-11-01/avatars/recent.png"), "utf8"),
  ).toBe("recent");
  expect(await driver.purge("2026-11-09")).toBe(1);
  expect(await readdir(path.join(driver.root, ".trash"))).toEqual(["2026-11-01", "2026-99-99"]);
});

it.skipIf(process.platform === "win32")("crea carpetas 0700 y archivos 0600 en Linux", async () => {
  await driver.put("avatars/private.png", Buffer.from("private"), { contentType: "image/png" });
  expect((await lstat(driver.root)).mode & 0o777).toBe(0o700);
  expect((await lstat(path.join(driver.root, "avatars"))).mode & 0o777).toBe(0o700);
  expect((await lstat(path.join(driver.root, "avatars/private.png"))).mode & 0o777).toBe(0o600);
});
