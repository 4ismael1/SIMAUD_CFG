import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { cleanDatabase, pool, prepareDatabase } from "./helpers.js";
import { loginUser, testApp, validPng } from "./t09b-helpers.js";
import { env } from "../src/config/env.js";
import { DiskStorage } from "../src/lib/storage-disk.js";
import { S3Storage, type S3Config } from "../src/lib/storage-s3.js";
import { decryptFile, encryptFile, isEncryptedSignature } from "../src/lib/storage-encryption.js";
import { assertPublicStorageEndpoint, type EndpointResolver } from "../src/lib/storage-endpoint.js";
import { saveStorageState } from "../src/lib/storage-config.js";
import { probeStorage } from "../src/modules/system/storage-service.js";
import { StorageError, type StorageDriver } from "../src/lib/storage-types.js";
import { withStorageLock } from "../src/lib/storage.js";
import { sha256 } from "../src/lib/crypto/canonical.js";
import { encryptLegacySignatures } from "../src/db/encrypt-legacy-signatures.js";

let root: string;
const configuration = {
  NODE_ENV: env.NODE_ENV,
  SETTINGS_ENCRYPTION_KEY: env.SETTINGS_ENCRYPTION_KEY,
  SIGNATURE_BACKFILL_PENDING: env.SIGNATURE_BACKFILL_PENDING,
};
const s3: S3Config = {
  driver: "s3",
  endpoint: "https://objects.example.test",
  region: "auto",
  bucket: "private",
  accessKeyId: "test-access",
  secretAccessKey: "test-secret",
  prefix: "",
  forcePathStyle: true,
};
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  root = await mkdtemp(path.join(os.tmpdir(), "simaud-t10-"));
});
afterEach(async () => {
  Object.assign(env, configuration);
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});
afterAll(() => pool.end());

it("backfill de disco comprueba hash, cifra sin cambiar PNG y es idempotente", async () => {
  const driver = new DiskStorage(root);
  await mkdir(path.join(root, "signatures"));
  const filename = path.join(root, "signatures/old.png");
  const plain = validPng();
  await writeFile(filename, plain);
  await expect(
    driver.encryptLegacySignature("signatures/old.png", "00".repeat(32)),
  ).rejects.toThrow("no coincide");
  expect(await readFile(filename)).toEqual(plain);
  expect(await driver.encryptLegacySignature("signatures/old.png", sha256(plain))).toBe(true);
  expect(isEncryptedSignature(await readFile(filename))).toBe(true);
  expect(await driver.get("signatures/old.png")).toEqual(plain);
  expect(await driver.encryptLegacySignature("signatures/old.png", sha256(plain))).toBe(false);
});

it("script opera sobre driver activo y rechaza firmas planas fuera de compatibilidad", async () => {
  const name = randomUUID() + ".png";
  await mkdir(path.join(root, "signatures"), { recursive: true });
  const filename = path.join(root, "signatures", name);
  await writeFile(filename, validPng());
  try {
    const factory = vi.fn(() => new DiskStorage(root));
    await encryptLegacySignatures(factory);
    expect(factory).toHaveBeenCalledWith({ driver: "disk" });
    expect(isEncryptedSignature(await readFile(filename))).toBe(true);
    expect((await encryptLegacySignatures(factory)).encrypted).toBe(0);
    env.NODE_ENV = "production";
    env.SIGNATURE_BACKFILL_PENDING = false;
    expect(() => decryptFile("signatures/old.png", validPng())).toThrow("sin cifrado autenticado");
    env.SIGNATURE_BACKFILL_PENDING = true;
    expect(decryptFile("signatures/old.png", validPng())).toEqual(validPng());
  } finally {
    await rm(filename, { force: true });
  }
});

it("GCM rechaza clave equivocada, tag alterado y traslado a otra clave lógica", () => {
  const encrypted = encryptFile("signatures/a.png", validPng());
  env.SETTINGS_ENCRYPTION_KEY =
    configuration.SETTINGS_ENCRYPTION_KEY === "22".repeat(32) ? "33".repeat(32) : "22".repeat(32);
  expect(() => decryptFile("signatures/a.png", encrypted)).toThrow("integridad");
  env.SETTINGS_ENCRYPTION_KEY = configuration.SETTINGS_ENCRYPTION_KEY;
  expect(() => decryptFile("signatures/b.png", encrypted)).toThrow("integridad");
  encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 1;
  expect(() => decryptFile("signatures/a.png", encrypted)).toThrow("integridad");
});

it("backfill S3 sustituye solo con ETag y verifica el cifrado actual", async () => {
  let object = validPng();
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const request = input as Request;
    if (request.method === "GET")
      return new Response(new Uint8Array(object), { headers: { etag: '"original"' } });
    expect(request.headers.get("if-match")).toBe('"original"');
    object = Buffer.from(await request.arrayBuffer());
    return new Response();
  });
  const driver = new S3Storage(s3, fetcher);
  expect(await driver.encryptLegacySignature("signatures/old.png", sha256(validPng()))).toBe(true);
  expect(isEncryptedSignature(object)).toBe(true);
  expect(await driver.get("signatures/old.png")).toEqual(validPng());
  expect(await driver.encryptLegacySignature("signatures/old.png", sha256(validPng()))).toBe(false);
  await expect(
    driver.encryptLegacySignature("signatures/old.png", "00".repeat(32)),
  ).rejects.toThrow("no coincide");
});

it("PUT y test no reutilizan el secreto guardado al cambiar host, bucket o identidad", async () => {
  await saveStorageState({ active: s3, migrating: false });
  const app = await testApp();
  try {
    const admin = await loginUser(app, { role: "admin" });
    const { secretAccessKey: _omitted, ...input } = s3;
    const request = vi.spyOn(globalThis, "fetch");
    for (const changes of [
      { endpoint: "https://another.example.test" },
      { bucket: "another-bucket" },
      { accessKeyId: "another-access" },
    ]) {
      for (const method of ["PUT", "POST"] as const) {
        const response = await app.inject({
          method,
          url: "/api/v1/system/storage" + (method === "POST" ? "/test" : ""),
          headers: admin.headers,
          payload: { ...input, ...changes },
        });
        expect(response.statusCode, response.body).toBe(400);
        expect(response.json().error.code).toBe("VALIDATION_ERROR");
      }
    }
    expect(request).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

it("probe exige inmutabilidad y muestra un paso con nombre immutability", async () => {
  let data: Buffer = Buffer.alloc(0);
  const mutable: StorageDriver = {
    put: async (_key, bytes) => {
      data = bytes;
    },
    get: async () => data,
    delete: async () => undefined,
    exists: async () => true,
    list: async () => [],
    purge: async () => 0,
  };
  const result = await probeStorage(mutable);
  expect(result).toMatchObject({
    ok: false,
    steps: expect.arrayContaining([
      { name: "immutability", ok: false, message: "El proveedor no impide sobrescribir objetos" },
    ]),
  });
  let exists = false;
  mutable.put = async (_key, bytes) => {
    if (exists) throw new StorageError("conflict", "Ya existe");
    exists = true;
    data = bytes;
  };
  expect((await probeStorage(mutable)).ok).toBe(true);
});

it("producción rechaza literales y DNS privados, loopback y link-local en IPv4 e IPv6", async () => {
  const resolver = vi.fn<EndpointResolver>();
  for (const host of ["127.0.0.1", "8.8.8.8", "[::1]"])
    await expect(
      assertPublicStorageEndpoint(new URL("https://" + host), true, resolver),
    ).rejects.toThrow("IP literales");
  for (const address of [
    "10.0.0.1",
    "127.0.0.1",
    "169.254.1.2",
    "172.16.0.1",
    "192.168.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
  ]) {
    resolver.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);
    await expect(
      assertPublicStorageEndpoint(new URL("https://objects.example.test"), true, resolver),
    ).rejects.toThrow("direcciones públicas");
  }
  resolver.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  await expect(
    assertPublicStorageEndpoint(new URL("https://objects.example.test"), true, resolver),
  ).resolves.toBeUndefined();
});

it("el bloqueo de backup tiene espera acotada y devuelve un 503 controlado", async () => {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(10409)");
    await expect(withStorageLock(async () => undefined)).rejects.toMatchObject({
      statusCode: 503,
      message: "Almacenamiento ocupado, inténtalo de nuevo",
    });
  } finally {
    await client.query("select pg_advisory_unlock(10409)");
    client.release();
  }
  await expect(withStorageLock(async () => "ok")).resolves.toBe("ok");
});
