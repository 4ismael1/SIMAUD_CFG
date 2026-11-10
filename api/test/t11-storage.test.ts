import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { S3Storage, type S3Config } from "../src/lib/storage-s3.js";
import { storage, withStorageMutation, purgeTrash } from "../src/lib/storage.js";
import { DiskStorage } from "../src/lib/storage-disk.js";
import { getSettings } from "../src/modules/system/settings.js";
import { probeStorage, updateStorage } from "../src/modules/system/storage-service.js";
import {
  startStorageMigration,
  waitStorageMigrations,
} from "../src/modules/system/storage-migration.js";
import { readStorageState, storageInput } from "../src/lib/storage-config.js";
import {
  contractAuditLogs,
  contracts,
  contractSignatories,
  files,
  jobRuns,
  settings,
  storageMigrationObjects,
  users,
} from "../src/db/schema.js";
import {
  authorization,
  cleanDatabase,
  createUser,
  db,
  pool,
  prepareDatabase,
  signIn,
} from "./helpers.js";

vi.mock("node:timers/promises", () => ({ setTimeout: async () => undefined }));

const config: S3Config = {
  driver: "s3",
  endpoint: "https://objects.example.test",
  region: "auto",
  bucket: "private",
  accessKeyId: "EXAMPLE_ACCESS_1234",
  secretAccessKey: "example-secret-never-expose",
  prefix: "tenant",
  forcePathStyle: true,
};
let objects: Map<string, Buffer>;
let requests: Request[];
let fail: (request: Request) => number;
/** When set, the fake provider waits for it before answering (keeps a migration running on fast databases). */
let hold: Promise<void> | undefined;
let app: FastifyInstance | undefined;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let writeIds: Map<string, string>;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  objects = new Map();
  writeIds = new Map();
  requests = [];
  fail = () => 0;
  hold = undefined;
  fetchMock = vi.fn<typeof fetch>(async (input) => {
    const request = input as Request;
    requests.push(request);
    expect(request.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=EXAMPLE_ACCESS_1234\/\d{8}\/auto\/s3\/aws4_request/,
    );
    expect(request.headers.get("authorization")).toMatch(
      /SignedHeaders=[a-z0-9;-]+, Signature=[a-f0-9]{64}$/,
    );
    expect(request.headers.get("x-amz-date")).toMatch(/^\d{8}T\d{6}Z$/);
    expect(request.headers.has("x-amz-acl")).toBe(false);
    expect(request.redirect).toBe("error");
    if (hold) await hold;
    const status = fail(request);
    if (status) return new Response("provider-body-" + config.secretAccessKey, { status });
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname);
    if (url.searchParams.has("list-type")) {
      const prefix = "/private/" + url.searchParams.get("prefix");
      return new Response(
        "<ListBucketResult>" +
          [...objects.keys()]
            .filter((value) => value.startsWith(prefix))
            .map(
              (value) => "<Contents><Key>" + value.slice("/private/".length) + "</Key></Contents>",
            )
            .join("") +
          "<IsTruncated>false</IsTruncated></ListBucketResult>",
      );
    }
    if (request.method === "PUT") {
      const copy = request.headers.get("x-amz-copy-source");
      if (copy) {
        const source = objects.get(decodeURIComponent(copy));
        if (!source) return new Response(null, { status: 404 });
        objects.set(key, Buffer.from(source));
      } else {
        if (request.headers.get("if-none-match") === "*" && objects.has(key))
          return new Response(null, { status: 412 });
        const bytes = Buffer.from(await request.arrayBuffer());
        expect(request.headers.get("x-amz-content-sha256")).toBe(
          createHash("sha256").update(bytes).digest("hex"),
        );
        objects.set(key, bytes);
        writeIds.set(key, request.headers.get("x-amz-meta-simaud-write-id")!);
      }
      return new Response(null, { status: 200 });
    }
    if (request.method === "DELETE") {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    const bytes = objects.get(key);
    return new Response(request.method === "HEAD" ? null : bytes ? new Uint8Array(bytes) : null, {
      status: bytes ? 200 : 404,
      headers: {
        etag: '"test-etag"',
        ...(writeIds.has(key) ? { "x-amz-meta-simaud-write-id": writeIds.get(key)! } : {}),
      },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await waitStorageMigrations();
  await app?.close();
  app = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(() => pool.end());

it("S3 firma put/get/head/copia/delete, verifica la conexión y limpia papelera con retención de ocho días", async () => {
  const driver = new S3Storage(config);
  expect((await probeStorage(driver)).ok).toBe(true);
  await driver.put("avatars/a.png", Buffer.from("a"), { contentType: "image/png" });
  expect(await driver.exists("avatars/a.png")).toBe(true);
  expect(await driver.get("avatars/a.png")).toEqual(Buffer.from("a"));
  await driver.delete("avatars/a.png", "2026-10-31");
  await driver.delete("avatars/a.png", "2026-10-31");
  expect(await driver.exists("avatars/a.png")).toBe(false);
  expect(objects.get("/private/tenant/trash/2026-10-31/avatars/a.png")).toEqual(Buffer.from("a"));
  expect(await driver.purge("2026-11-09")).toBe(1);
});

it("S3 distingue 403/404, reintenta 5xx/429 y sanea respuestas o excepciones con secretos", async () => {
  const driver = new S3Storage(config);
  fail = () => 403;
  const denied = await probeStorage(driver);
  expect(denied).toMatchObject({
    ok: false,
    steps: [
      { name: "put", ok: false, message: expect.stringContaining("Credenciales rechazadas") },
    ],
  });
  expect(JSON.stringify(denied)).not.toContain(config.secretAccessKey);
  fail = () => 404;
  expect((await probeStorage(driver)).steps[0]!.message).toContain("no existe");
  fail = () => 503;
  const before = requests.length;
  await expect(driver.get("missing")).rejects.toThrow("no está disponible");
  expect(requests.length - before).toBe(3);
  let attempts = 0;
  fail = () => (++attempts < 3 ? 429 : 0);
  await driver.put("retry", Buffer.from("retry"), { contentType: "text/plain" });
  expect(attempts).toBe(3);
  fetchMock.mockRejectedValue(new Error(config.secretAccessKey));
  await expect(driver.get("retry")).rejects.toThrow("Endpoint inaccesible");
});

it("S3 construye virtual-host sin barras duplicadas y cifra firmas en tránsito al proveedor", async () => {
  const driver = new S3Storage({ ...config, forcePathStyle: false });
  const bytes = Buffer.from("private signature");
  await driver.put("signatures/private.png", bytes, { contentType: "image/png" });
  expect(requests[0]!.url).toBe(
    "https://private.objects.example.test/tenant/signatures/private.png",
  );
  expect(objects.get("/tenant/signatures/private.png")!.includes(bytes)).toBe(false);
  expect(await driver.get("signatures/private.png")).toEqual(bytes);
});

it("reconoce su PUT aceptado tras perder la respuesta y mantiene inmutable un objeto anterior", async () => {
  const driver = new S3Storage(config);
  const serve = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementationOnce(async (input, init) => {
    await serve(input, init);
    throw new TypeError("Conexión interrumpida después de aceptar el PUT");
  });
  const bytes = Buffer.from("accepted once");
  await driver.put("avatars/retry.png", bytes, { contentType: "image/png" });
  expect(await driver.get("avatars/retry.png")).toEqual(bytes);
  await expect(
    driver.put("avatars/retry.png", bytes, { contentType: "image/png" }),
  ).rejects.toThrow("existe");
  expect(await driver.get("avatars/retry.png")).toEqual(bytes);
});

it("cifra configuración en settings, no expone secretos en HTTP, auditoría ni logs y conserva la clave omitida", async () => {
  app = await buildApp({ logger: false });
  const log = vi.spyOn(app.log, "error");
  const admin = await createUser({ role: "admin" });
  const headers = authorization((await signIn(app, admin)).token);
  const saved = await app.inject({
    method: "PUT",
    url: "/api/v1/system/storage",
    headers,
    payload: config,
  });
  expect(saved.statusCode, saved.body).toBe(200);
  expect(saved.json()).toMatchObject({
    driver: "s3",
    accessKeyLast4: "1234",
    hasSecret: true,
    pending: null,
  });
  const result = await app.inject({ url: "/api/v1/system/storage", headers });
  expect(result.body).not.toContain(config.secretAccessKey);
  expect(result.body).not.toContain(config.accessKeyId);
  const rows = await db.select().from(settings).where(eq(settings.key, "storage"));
  expect(JSON.stringify(rows)).not.toContain(config.secretAccessKey);
  expect(JSON.stringify(rows)).not.toContain(config.accessKeyId);
  expect(rows[0]!.value).toMatchObject({
    version: 1,
    data: expect.any(String),
    tag: expect.any(String),
  });
  expect(await getSettings()).toMatchObject({ institution: { name: "SIMAUD" } });
  const { secretAccessKey: omitted, ...withoutSecret } = config;
  expect(
    (
      await app.inject({
        method: "PUT",
        url: "/api/v1/system/storage",
        headers,
        payload: withoutSecret,
      })
    ).statusCode,
  ).toBe(200);
  expect((await readStorageState()).active).toMatchObject({ secretAccessKey: omitted });
  const audit = JSON.stringify(await db.select().from(contractAuditLogs));
  expect(audit).not.toContain(config.secretAccessKey);
  expect(audit).toContain("storage:configure");
  fail = () => 403;
  const rejected = await app.inject({
    method: "PUT",
    url: "/api/v1/system/storage",
    headers,
    payload: { driver: "disk" },
  });
  // Disk remains usable even when S3 credentials stop working.
  expect(rejected.statusCode).toBe(200);
  const failed = await app.inject({
    method: "PUT",
    url: "/api/v1/system/storage",
    headers,
    payload: config,
  });
  expect(failed.statusCode).toBe(503);
  expect((await readStorageState()).active.driver).toBe("disk");
  expect(JSON.stringify(log.mock.calls)).not.toContain(config.secretAccessKey);
  expect(failed.body).not.toContain(config.secretAccessKey);
});

it("solo admin administra storage y test aplica diez intentos por minuto por cuenta", async () => {
  app = await buildApp({ logger: false });
  const admin = await createUser({ role: "admin" });
  const user = await createUser();
  const headers = authorization((await signIn(app, admin)).token);
  const userHeaders = authorization((await signIn(app, user)).token);
  for (const route of [
    { method: "GET", url: "/system/storage" },
    { method: "PUT", url: "/system/storage" },
    { method: "POST", url: "/system/storage/test" },
    { method: "POST", url: "/system/storage/migrate" },
  ] as const) {
    expect(
      (await app.inject({ ...route, url: "/api/v1" + route.url, headers: userHeaders })).statusCode,
    ).toBe(403);
  }
  for (let index = 0; index < 10; index++)
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/system/storage/test",
          headers,
          payload: config,
        })
      ).statusCode,
    ).toBe(200);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/system/storage/test",
        headers,
        payload: config,
      })
    ).statusCode,
  ).toBe(429);
  expect((await readStorageState()).active.driver).toBe("disk");
});

it("valida endpoints HTTPS, permite localhost en pruebas y rechaza rutas y prefijos peligrosos", () => {
  for (const endpoint of [
    "http://objects.example.test",
    "https://user:secret@objects.example.test",
    "https://objects.example.test/path",
    "https://objects.example.test/?secret=1",
  ])
    expect(storageInput.safeParse({ ...config, endpoint }).success).toBe(false);
  expect(storageInput.safeParse({ ...config, endpoint: "http://localhost:9000" }).success).toBe(
    true,
  );
  expect(storageInput.safeParse({ ...config, prefix: "../secret" }).success).toBe(false);
});

it("migra referencias históricas, verifica SHA/tamaño y reanuda sin borrar origen ni duplicar copias", async () => {
  const actor = await createUser({ role: "admin" });
  const name = randomUUID() + ".png";
  const key = "avatars/" + name;
  const bytes = Buffer.from("historic avatar");
  const disk = new DiskStorage();
  await disk.put(key, bytes, { contentType: "image/png" });
  await db.insert(files).values({
    ownerId: actor.id,
    kind: "avatar",
    path: name,
    mime: "image/png",
    size: bytes.length,
  });
  await db.update(users).set({ avatarPath: name }).where(eq(users.id, actor.id));
  await updateStorage(config, { userId: actor.id });
  expect((await readStorageState()).active.driver).toBe("disk");
  expect((await readStorageState()).pending?.driver).toBe("s3");
  fail = (request) => (request.method === "GET" && request.url.endsWith(name) ? 503 : 0);
  let release!: () => void;
  hold = new Promise((resolve) => (release = resolve));
  const { jobId } = await startStorageMigration({ userId: actor.id });
  await expect(withStorageMutation(async () => undefined)).rejects.toThrow("migración");
  hold = undefined;
  release();
  await waitStorageMigrations();
  expect((await db.select().from(jobRuns).where(eq(jobRuns.id, jobId)))[0]).toMatchObject({
    ok: false,
    summary: { failed: 1, verified: 0, failures: [{ key, reason: "Proveedor inaccesible." }] },
  });
  expect((await readStorageState()).migrating).toBe(false);
  expect((await readStorageState()).pending?.driver).toBe("s3");
  expect(await storage.get(key)).toEqual(bytes);
  await expect(withStorageMutation(async () => undefined)).resolves.toBeUndefined();
  fail = () => 0;
  objects.set("/private/tenant/" + key, Buffer.from("corrupt destination"));
  await startStorageMigration({ userId: actor.id });
  await waitStorageMigrations();
  expect((await readStorageState()).active.driver).toBe("disk");
  expect((await db.select().from(jobRuns).where(eq(jobRuns.id, jobId)))[0]!.ok).toBe(false);
  objects.set("/private/tenant/" + key, bytes);
  const before = requests.filter(
    (request) => request.method === "PUT" && request.url.endsWith(name),
  ).length;
  expect((await startStorageMigration({ userId: actor.id })).jobId).toBe(jobId);
  await waitStorageMigrations();
  expect((await db.select().from(jobRuns).where(eq(jobRuns.id, jobId)))[0]).toMatchObject({
    ok: true,
    summary: { total: 1, verified: 1, failed: 0 },
  });
  expect(
    requests.filter((request) => request.method === "PUT" && request.url.endsWith(name)),
  ).toHaveLength(before);
  expect((await readStorageState()).active.driver).toBe("s3");
  expect(await storage.get(key)).toEqual(bytes);
  expect(await disk.get(key)).toEqual(bytes);
  expect(await db.select().from(storageMigrationObjects)).toHaveLength(1);
  await storage.delete(key);
  expect(await storage.exists(key)).toBe(false);
  await purgeTrash("2026-11-09");
  await disk.delete(key);
});

it("migra PDF y firmas sin filas files y rechaza tamaño o SHA de origen incorrectos", async () => {
  const admin = await createUser({ role: "admin" });
  const pdfName = randomUUID() + "-v1.pdf";
  const signatureName = randomUUID() + ".png";
  const disk = new DiskStorage();
  const pdf = Buffer.from("historic final PDF");
  const signature = Buffer.from("historic signature");
  const exportName = randomUUID() + ".csv";
  const exported = Buffer.from("columna\nvalor");
  await disk.put("exports/" + exportName, exported, { contentType: "text/csv" });
  await db.insert(files).values({
    ownerId: admin.id,
    kind: "export",
    path: exportName,
    mime: "text/csv",
    size: exported.length + 1,
  });
  await disk.put("contracts/" + pdfName, pdf, { contentType: "application/pdf" });
  await disk.put("signatures/" + signatureName, signature, { contentType: "image/png" });
  objects.set("/private/tenant/signatures/" + signatureName, signature);
  const [contract] = await db
    .insert(contracts)
    .values({
      title: "Firmado",
      content: "Documento",
      createdBy: admin.id,
      status: "active",
      signedPdfPath: pdfName,
      signedPdfSha256: "0".repeat(64),
    })
    .returning();
  await db.insert(contractSignatories).values({
    contractId: contract!.id,
    name: "Firmante",
    email: admin.email,
    role: "client",
    status: "signed",
    signaturePath: signatureName,
  });
  await updateStorage(config, { userId: admin.id });
  const { jobId } = await startStorageMigration({ userId: admin.id });
  await waitStorageMigrations();
  expect((await readStorageState()).active.driver).toBe("disk");
  expect((await db.select().from(jobRuns).where(eq(jobRuns.id, jobId)))[0]).toMatchObject({
    ok: false,
    summary: { total: 3, verified: 1, failed: 2 },
  });
  await db.update(files).set({ size: exported.length }).where(eq(files.path, exportName));
  await db
    .update(contracts)
    .set({ signedPdfSha256: createHash("sha256").update(pdf).digest("hex") })
    .where(eq(contracts.id, contract!.id));
  app = await buildApp({ logger: false });
  const headers = authorization((await signIn(app, admin)).token);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/system/storage/migrate",
    headers,
  });
  expect(response.statusCode, response.body).toBe(202);
  expect(response.json()).toEqual({ jobId });
  await waitStorageMigrations();
  const jobs = await app.inject({ url: "/api/v1/system/jobs", headers });
  expect(jobs.json()).toContainEqual(
    expect.objectContaining({
      name: "storage-migrate",
      lastRun: expect.objectContaining({
        ok: true,
        summary: { total: 3, copied: 2, verified: 3, failed: 0, failures: [] },
      }),
    }),
  );
  expect(await storage.get("contracts/" + pdfName)).toEqual(pdf);
  expect(await storage.get("signatures/" + signatureName)).toEqual(signature);
  expect(
    objects
      .get("/private/tenant/signatures/" + signatureName)!
      .subarray(0, 10)
      .toString(),
  ).toBe("SIMAUDSIG1");
  await updateStorage({ driver: "disk" }, { userId: admin.id });
  await startStorageMigration({ userId: admin.id });
  await waitStorageMigrations();
  expect((await readStorageState()).active.driver).toBe("disk");
  expect(await disk.get("contracts/" + pdfName)).toEqual(pdf);
  await disk.delete("contracts/" + pdfName);
  await disk.delete("signatures/" + signatureName);
  await disk.delete("exports/" + exportName);
});
