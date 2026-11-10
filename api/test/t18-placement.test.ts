import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { cleanDatabase, db, pool, prepareDatabase } from "./helpers.js";
import { testApp, validPng } from "./t09b-helpers.js";
import { signingFixture } from "./t18-helpers.js";
import { contractSignatories, signatureEvidence } from "../src/db/schema.js";
import { verifyEvidenceChain } from "../src/modules/contracts/evidence.js";
import { storage } from "../src/lib/storage.js";
import { encodeRgba, normalizeSignaturePng } from "../src/lib/storage-png.js";
import { placeSignature } from "../src/lib/signature-placement.js";
import { canonicalJson, sha256 } from "../src/lib/crypto/canonical.js";
import { contracts } from "../src/db/schema.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
});
afterAll(() => pool.end());

it("recorta transparencia con margen, limita tamaño y rechaza firmas vacías", () => {
  const pixels = Buffer.alloc(100 * 50 * 4);
  pixels.fill(255, (25 * 100 + 50) * 4, (25 * 100 + 50) * 4 + 4);
  const normalized = normalizeSignaturePng(encodeRgba(100, 50, pixels));
  expect(normalized.readUInt32BE(16)).toBe(9);
  expect(normalized.readUInt32BE(20)).toBe(9);
  expect(normalizeSignaturePng(normalized)).toEqual(normalized);
  expect(() => normalizeSignaturePng(encodeRgba(10, 10, Buffer.alloc(400)))).toThrow("vacía");
  const large = normalizeSignaturePng(encodeRgba(2000, 1000, Buffer.alloc(2000 * 1000 * 4, 255)));
  expect(large.readUInt32BE(16)).toBe(1000);
  expect(large.readUInt32BE(20)).toBe(500);
});

it("hace clamp incluso con centros y escalas extremos sin sacar la imagen de su casilla", () => {
  for (const x of [-1e300, 0, 0.5, 1, 1e300]) {
    for (const y of [-1e300, 1e300]) {
      for (const scale of [-1e300, 0.5, 1, 1e300]) {
        const placed = placeSignature(300, 80, 160, 42, { x, y, scale });
        expect(placed.left).toBeGreaterThanOrEqual(-0.00001);
        expect(placed.top).toBeGreaterThanOrEqual(-0.00001);
        expect(placed.left + placed.width).toBeLessThanOrEqual(160.00001);
        expect(placed.top + placed.height).toBeLessThanOrEqual(42.00001);
      }
    }
  }
});

it("conserva ajustes y re-firmas propias después de otro firmante, sin reiniciar turnos y con evidencia verificable", async () => {
  const fixture = await signingFixture(app);
  expect((await fixture.sign(0)).statusCode).toBe(200);
  expect((await fixture.sign(1)).statusCode).toBe(200);
  const before = await db
    .select()
    .from(contractSignatories)
    .where(eq(contractSignatories.contractId, fixture.contract.id));
  const previous = before.find((signer) => signer.userId === fixture.actors[0]!.user.id)!;
  const adjusted = await fixture.adjust(0, { x: -100, y: 100, scale: 0.5 });
  expect(adjusted.statusCode, adjusted.body).toBe(200);
  const replacement = await fixture.sign(0, {
    method: "drawn",
    placement: JSON.stringify({ x: 1, y: 0, scale: 0.6 }),
  });
  expect(replacement.statusCode, replacement.body).toBe(200);
  const after = await db
    .select()
    .from(contractSignatories)
    .where(eq(contractSignatories.contractId, fixture.contract.id));
  expect(after.find((signer) => signer.userId === fixture.actors[1]!.user.id)).toEqual(
    before.find((signer) => signer.userId === fixture.actors[1]!.user.id),
  );
  expect(
    after.find((signer) => signer.userId === fixture.actors[0]!.user.id)!.signaturePath,
  ).not.toBe(previous.signaturePath);
  expect(await storage.get("signatures/" + previous.signaturePath)).toEqual(validPng());
  const evidence = await db.select().from(signatureEvidence).orderBy(signatureEvidence.sequence);
  expect(evidence.map((row) => row.payload.event)).toEqual([
    "signed",
    "signed",
    "placement_adjusted",
    "resigned",
  ]);
  expect(evidence[3]!.payload.supersedesEvidenceHash).toBe(evidence[2]!.evidenceHash);
  expect(await verifyEvidenceChain(fixture.contract.id)).toBe(true);
  const detail = await app.inject({
    url: `/api/v1/contracts/${fixture.contract.id}`,
    headers: fixture.actors[0]!.headers,
  });
  expect(detail.json().can.adjustSignature).toBe(true);
  expect(detail.json().signatureSlot).toMatchObject({
    page: expect.any(Number),
    slotIndex: 0,
    x: expect.any(Number),
    y: expect.any(Number),
    width: expect.any(Number),
    height: expect.any(Number),
  });
  expect((await fixture.sign(2)).statusCode).toBe(200);
  if (process.env.T18_PDF_REVIEW === "true") {
    const { writeFile } = await import("node:fs/promises");
    const current = await fixture.current();
    await writeFile(
      "tmp/t18-placement-final.pdf",
      await storage.get("contracts/" + current.signedPdfPath),
    );
    await writeFile("tmp/t18-placement-detail.json", detail.body);
  }
  expect((await fixture.adjust(0)).statusCode).toBe(409);
  expect((await fixture.sign(0)).statusCode).toBe(409);
  expect(await verifyEvidenceChain(fixture.contract.id)).toBe(true);
});

it("verifica evidencia v1 y la enlaza con un ajuste v2 sin reescribir la fila histórica", async () => {
  const fixture = await signingFixture(app, 2);
  await fixture.sign(0);
  const [row] = await db.select().from(signatureEvidence);
  const {
    placement: _placement,
    event: _event,
    supersedesEvidenceHash: _supersedes,
    recordedAt: _recorded,
    ...original
  } = row!.payload;
  const legacy = { ...original, format: "simaud-evidence-v1" as const };
  const hash = sha256(canonicalJson(legacy));
  await db
    .update(signatureEvidence)
    .set({ payload: legacy, evidenceHash: hash })
    .where(eq(signatureEvidence.id, row!.id));
  await db
    .update(contracts)
    .set({ evidenceHead: hash })
    .where(eq(contracts.id, fixture.contract.id));
  await db
    .update(contractSignatories)
    .set({ placement: null })
    .where(eq(contractSignatories.userId, fixture.actors[0]!.user.id));
  expect(await verifyEvidenceChain(fixture.contract.id)).toBe(true);
  expect((await fixture.adjust(0)).statusCode).toBe(200);
  expect(await verifyEvidenceChain(fixture.contract.id)).toBe(true);
  expect(
    (await db.select().from(signatureEvidence).where(eq(signatureEvidence.id, row!.id)))[0]!
      .payload,
  ).toEqual(legacy);
});

it("nadie ajusta una firma ajena, ni admin, y rechaza identificadores extra", async () => {
  const fixture = await signingFixture(app, 2);
  await fixture.sign(0);
  const url = `/api/v1/contracts/${fixture.contract.id}/signatures/me/placement`;
  expect(
    (
      await app.inject({
        method: "PATCH",
        url,
        headers: fixture.admin.headers,
        payload: { placement: { x: 0.5, y: 0.5, scale: 1 } },
      })
    ).statusCode,
  ).toBe(404);
  expect((await fixture.adjust(1)).statusCode).toBe(409);
  expect(
    (
      await app.inject({
        method: "PATCH",
        url,
        headers: fixture.actors[0]!.headers,
        payload: { placement: { x: 0.5, y: 0.5, scale: 1 }, userId: fixture.actors[1]!.user.id },
      })
    ).statusCode,
  ).toBe(400);
});

it("reintentos idénticos de ajuste y firma no duplican evidencia", async () => {
  const fixture = await signingFixture(app, 2);
  await fixture.sign(0);
  await fixture.sign(0);
  expect((await db.select().from(signatureEvidence)).length).toBe(1);
  await fixture.adjust(0);
  await fixture.adjust(0);
  expect((await db.select().from(signatureEvidence)).length).toBe(2);
});

function barrier() {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { enter, release, entered, released };
}

it("un ajuste que obtiene el bloqueo antes de la última firma queda incluido en la activación", async () => {
  const fixture = await signingFixture(app, 2);
  await fixture.sign(0);
  const gate = barrier();
  const get = storage.get.bind(storage);
  let paused = false;
  vi.spyOn(storage, "get").mockImplementation(async (key) => {
    if (!paused && key.startsWith("signatures/")) {
      paused = true;
      gate.enter();
      await gate.released;
    }
    return get(key);
  });
  const adjustment = fixture.adjust(0).then((response) => response);
  await gate.entered;
  const last = fixture.sign(1);
  gate.release();
  const [adjusted, signed] = await Promise.all([adjustment, last]);
  expect(adjusted.statusCode, adjusted.body).toBe(200);
  expect(signed.statusCode, signed.body).toBe(200);
  expect((await fixture.current()).status).toBe("active");
  expect(await verifyEvidenceChain(fixture.contract.id)).toBe(true);
});

it("si la última firma obtiene primero el bloqueo, el ajuste concurrente devuelve 409", async () => {
  const fixture = await signingFixture(app, 2);
  await fixture.sign(0);
  const gate = barrier();
  const get = storage.get.bind(storage);
  let paused = false;
  vi.spyOn(storage, "get").mockImplementation(async (key) => {
    if (!paused && key.startsWith("signatures/")) {
      paused = true;
      gate.enter();
      await gate.released;
    }
    return get(key);
  });
  const last = fixture.sign(1);
  await gate.entered;
  const adjustment = fixture.adjust(0).then((response) => response);
  gate.release();
  const [signed, adjusted] = await Promise.all([last, adjustment]);
  expect(signed.statusCode, signed.body).toBe(200);
  expect(adjusted.statusCode, adjusted.body).toBe(409);
  expect(await verifyEvidenceChain(fixture.contract.id)).toBe(true);
});
