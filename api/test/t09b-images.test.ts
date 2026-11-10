import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { readdir, readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { db, pool, cleanDatabase, prepareDatabase } from "./helpers.js";
import { contractSignatories, files, settings } from "../src/db/schema.js";
import { sanitizePng, encodeRgba, pngChunk } from "../src/lib/storage-png.js";
import { validPng, contractFixture, imageMultipart, loginUser, testApp } from "./t09b-helpers.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
});
afterEach(async () => {
  await app.close();
});
afterAll(() => pool.end());

function hugePng() {
  const data = validPng();
  const header = Buffer.from(data.subarray(16, 29));
  header.writeUInt32BE(2001);
  return Buffer.concat([data.subarray(0, 8), pngChunk("IHDR", header), data.subarray(33)]);
}

it("decodifica y recodifica PNG sin metadatos, rechazando truncado, enorme y CRC corrupto", () => {
  const data = validPng();
  expect(sanitizePng(data)).toEqual(data);
  expect(() => sanitizePng(data.subarray(0, 24))).toThrow("PNG");
  expect(() => sanitizePng(hugePng())).toThrow("PNG");
  const corrupt = Buffer.from(data);
  corrupt[40] = corrupt[40]! ^ 1;
  expect(() => sanitizePng(corrupt)).toThrow("PNG");
  const annotated = Buffer.concat([
    data.subarray(0, 33),
    pngChunk("tEXt", Buffer.from("note\0private")),
    data.subarray(33),
  ]);
  expect(sanitizePng(annotated)).toEqual(data);
  expect(() => sanitizePng(encodeRgba(1, 1001, Buffer.alloc(4004)))).toThrow("PNG");
  for (const raw of [Buffer.alloc(1000000), Buffer.from([5, 0, 0, 0, 0, 0, 0, 0, 0])]) {
    const invalidImage = Buffer.concat([
      data.subarray(0, 33),
      pngChunk("IDAT", deflateSync(raw)),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
    expect(() => sanitizePng(invalidImage)).toThrow("PNG");
  }
});

it("conserva la transparencia PNG al recodificar píxeles grises", () => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  const image = Buffer.concat([
    validPng().subarray(0, 8),
    pngChunk("IHDR", header),
    pngChunk("tRNS", Buffer.from([0, 123])),
    pngChunk("IDAT", deflateSync(Buffer.from([0, 123]))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  expect(sanitizePng(image)).toEqual(encodeRgba(1, 1, Buffer.from([123, 123, 123, 0])));
});

it("una firma inválida no deja archivo, fila ni estado parcial y dos firmas válidas generan PDF", async () => {
  const first = await loginUser(app);
  const second = await loginUser(app);
  const contract = await contractFixture(first.user.id);
  await db.insert(contractSignatories).values([
    {
      contractId: contract.id,
      userId: first.user.id,
      name: first.user.name,
      email: first.user.email,
      role: "client",
      signingOrder: 1,
    },
    {
      contractId: contract.id,
      userId: second.user.id,
      name: second.user.name,
      email: second.user.email,
      role: "witness",
      signingOrder: 2,
    },
  ]);
  const sign = (headers: Record<string, string>, image: Buffer) =>
    app.inject({
      method: "POST",
      url: `/api/v1/contracts/${contract.id}/sign`,
      headers: { ...headers, "content-type": "multipart/form-data; boundary=t09b" },
      payload: imageMultipart(image, {
        acceptedDeclaration: "true",
        viewedAt: contract.updatedAt.toISOString(),
      }),
    });
  const before = await readdir("storage/signatures").catch(() => []);
  for (const image of [validPng().subarray(0, 24), hugePng()]) {
    const response = await sign(first.headers, image);
    expect(response.statusCode, response.body).toBe(400);
    expect(await db.select().from(files)).toHaveLength(0);
    expect(
      (await db.select().from(contractSignatories)).every((row) => row.status === "pending"),
    ).toBe(true);
    expect(await readdir("storage/signatures").catch(() => [])).toEqual(before);
  }
  expect((await sign(first.headers, validPng())).statusCode).toBe(200);
  const final = await sign(second.headers, validPng());
  expect(final.statusCode, final.body).toBe(200);
  const response = await app.inject({
    url: `/api/v1/contracts/${contract.id}/pdf?final=true`,
    headers: first.headers,
  });
  expect(response.statusCode).toBe(200);
  expect(response.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
});

it("avatar rechaza PNG truncado o enorme sin persistencia y conserva el anterior en papelera", async () => {
  const actor = await loginUser(app);
  const upload = (image: Buffer) =>
    app.inject({
      method: "PUT",
      url: "/api/v1/me/avatar",
      headers: {
        ...actor.headers,
        "content-type": "multipart/form-data; boundary=t09b",
      },
      payload: imageMultipart(image, {}, "avatar"),
    });
  for (const image of [validPng().subarray(0, 24), hugePng()]) {
    expect((await upload(image)).statusCode).toBe(400);
    expect(await db.select().from(files)).toHaveLength(0);
  }
  const first = await upload(validPng());
  expect(first.statusCode, first.body).toBe(200);
  const name = first.json().user.avatarPath as string;
  expect((await upload(validPng())).statusCode).toBe(200);
  const day = new Date().toISOString().slice(0, 10);
  expect(await readFile(`storage/.trash/${day}/avatars/${name}`)).toEqual(validPng());
});

it("el logo institucional se decodifica antes de persistir y permite PNG válido", async () => {
  const actor = await loginUser(app, { role: "admin" });
  const update = (image: Buffer) =>
    app.inject({
      method: "PATCH",
      url: "/api/v1/system/settings",
      headers: actor.headers,
      payload: {
        institution: {
          name: "Institución",
          rnc: "",
          address: "",
          logo: "data:image/png;base64," + image.toString("base64"),
        },
      },
    });
  for (const image of [validPng().subarray(0, 24), hugePng()]) {
    const response = await update(image);
    expect(response.statusCode, response.body).toBe(400);
    expect(await db.select().from(settings).where(eq(settings.key, "institution"))).toHaveLength(0);
  }
  const response = await update(validPng());
  expect(response.statusCode, response.body).toBe(200);
});
