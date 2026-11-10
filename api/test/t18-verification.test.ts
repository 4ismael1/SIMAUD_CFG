import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { cleanDatabase, db, pool, prepareDatabase } from "./helpers.js";
import { testApp } from "./t09b-helpers.js";
import { signingFixture } from "./t18-helpers.js";
import { contracts, verificationCodes, contractAuditLogs } from "../src/db/schema.js";
import { sha256 } from "../src/lib/crypto/canonical.js";
import { storage } from "../src/lib/storage.js";
import * as codes from "../src/modules/verify/codes.js";
import { verifyAuditChain } from "../src/lib/crypto/audit-chain.js";

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

it("genera códigos Crockford de 80 bits independientes y normaliza mayúsculas y guiones", () => {
  const generated = Array.from({ length: 1000 }, () => codes.generateVerificationCode());
  expect(new Set(generated).size).toBe(1000);
  for (const code of generated) {
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(codes.normalizeVerificationCode(code.toLowerCase().replace(/-/g, ""))).toBe(
      code.replace(/-/g, ""),
    );
  }
  expect(codes.normalizeVerificationCode("CT-2026-000001")).toBeNull();
  expect(codes.normalizeVerificationCode("IIII-LLLL-OOOO-UUUU")).toBeNull();
});

it("publica datos de comparación y distingue un archivo alterado en un byte mediante su huella", async () => {
  const fixture = await signingFixture(app, 1);
  const contract = await fixture.seal();
  const code = contract.verificationCode!;
  const response = await app.inject({
    url: "/api/v1/verify/" + code.toLowerCase().replace(/-/g, ""),
  });
  const bytes = await storage.get("contracts/" + contract.signedPdfPath);
  expect(response.json()).toMatchObject({
    status: "registered",
    legacy: false,
    downloadAvailable: true,
    pageCount: (await PDFDocument.load(bytes)).getPageCount(),
    finalPdfSha256: sha256(bytes),
    systemSignatureValid: true,
  });
  expect(response.headers["cache-control"]).toBe("no-store");
  const hash = (code: string, sha256: string) =>
    app.inject({ method: "POST", url: "/api/v1/verify/hash", payload: { code, sha256 } });
  expect((await hash(code, sha256(bytes).toUpperCase())).json()).toEqual({
    match: true,
    status: "registered",
  });
  const altered = Buffer.from(bytes);
  altered[altered.length - 1] = altered[altered.length - 1]! ^ 1;
  expect((await hash(code, sha256(altered))).json()).toEqual({
    match: false,
    status: "registered",
  });
  for (const unknown of ["CT-2026-000001", "malformado", "0000-0000-0000-0000"]) {
    expect((await app.inject({ url: "/api/v1/verify/" + unknown })).json()).toEqual({
      status: "not_found",
    });
    expect((await hash(unknown, sha256(bytes))).json()).toEqual({
      match: false,
      status: "not_found",
    });
  }
  expect((await hash(code, "zz")).statusCode).toBe(400);
});

it("descarga una copia marcada sin modificar el PDF, la huella o el sello y audita solo IP truncada", async () => {
  const fixture = await signingFixture(app, 1);
  const contract = await fixture.seal();
  const original = await storage.get("contracts/" + contract.signedPdfPath);
  const response = await app.inject({
    url: `/api/v1/verify/${contract.verificationCode}/pdf`,
    remoteAddress: "198.51.100.45",
  });
  expect(response.statusCode, response.body).toBe(200);
  expect(response.headers["content-disposition"]).toContain("attachment");
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.rawPayload).not.toEqual(original);
  const marked = await PDFDocument.load(response.rawPayload);
  for (const page of marked.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
    const commands = streams
      .map((reference) => {
        const stream = marked.context.lookup(reference);
        return stream instanceof PDFRawStream
          ? Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1")
          : "";
      })
      .join("\n");
    const winAnsiLabel =
      Buffer.from("Copia de verificación ", "latin1").toString("hex").toUpperCase() + "9720";
    expect(commands).toContain(winAnsiLabel);
  }
  const comparison = await app.inject({
    method: "POST",
    url: "/api/v1/verify/hash",
    payload: { code: contract.verificationCode, sha256: sha256(response.rawPayload) },
  });
  expect(comparison.json()).toEqual({ match: false, status: "registered" });
  expect((await PDFDocument.load(response.rawPayload)).getPageCount()).toBe(
    (await PDFDocument.load(original)).getPageCount(),
  );
  expect(await storage.get("contracts/" + contract.signedPdfPath)).toEqual(original);
  expect(await fixture.current()).toMatchObject({
    signedPdfSha256: contract.signedPdfSha256,
    systemSeal: contract.systemSeal,
  });
  const [log] = await db
    .select()
    .from(contractAuditLogs)
    .where(eq(contractAuditLogs.action, "verification_pdf_downloaded"));
  expect(log).toMatchObject({ ip: "198.51.*.*", userId: null, userAgent: null, newValues: null });
  expect(await verifyAuditChain(contract.id)).toBe(true);
  expect(
    (await app.inject({ url: "/api/v1/verify/" + contract.verificationCode })).json(),
  ).toMatchObject({ status: "registered" });
  if (process.env.T18_PDF_REVIEW === "true") {
    const { writeFile } = await import("node:fs/promises");
    await writeFile("tmp/t18-original.pdf", original);
    await writeFile("tmp/t18-copy.pdf", response.rawPayload);
  }
});

it("mantiene códigos legacy resolubles y sin descarga", async () => {
  vi.spyOn(codes, "generateVerificationCode").mockReturnValue("SIM-1234-5678-9ABC-DEF0-1234");
  const fixture = await signingFixture(app, 1);
  const contract = await fixture.seal();
  await db.update(verificationCodes).set({ legacy: true });
  const result = await app.inject({ url: "/api/v1/verify/sim123456789abcdef01234" });
  expect(result.json()).toMatchObject({
    status: "registered",
    legacy: true,
    downloadAvailable: false,
    systemSignatureValid: true,
  });
  expect(
    (await app.inject({ url: `/api/v1/verify/${contract.verificationCode}/pdf` })).statusCode,
  ).toBe(404);
});

it("solo admin rota con motivo, oculta el código revocado y conserva el sello y el QR históricos", async () => {
  const fixture = await signingFixture(app, 1);
  const contract = await fixture.seal();
  const rotate = (headers: typeof fixture.admin.headers, payload: Record<string, string>) =>
    app.inject({
      method: "POST",
      url: `/api/v1/contracts/${contract.id}/verification-code/rotate`,
      headers,
      payload,
    });
  expect((await rotate(fixture.actors[0]!.headers, { reason: "Expuesto" })).statusCode).toBe(403);
  expect((await rotate(fixture.admin.headers, {})).statusCode).toBe(400);
  const result = await rotate(fixture.admin.headers, { reason: "Código expuesto" });
  expect(result.statusCode, result.body).toBe(200);
  const next = result.json().verificationCode;
  expect(next).not.toBe(contract.verificationCode);
  expect((await app.inject({ url: "/api/v1/verify/" + contract.verificationCode })).json()).toEqual(
    { status: "revoked" },
  );
  expect(
    (await app.inject({ url: `/api/v1/verify/${contract.verificationCode}/pdf` })).statusCode,
  ).toBe(404);
  expect((await app.inject({ url: "/api/v1/verify/" + next })).json()).toMatchObject({
    status: "registered",
    systemSignatureValid: true,
    downloadAvailable: true,
  });
  expect((await fixture.current()).systemSeal).toEqual(contract.systemSeal);
  expect((await fixture.current()).signedPdfSha256).toBe(contract.signedPdfSha256);
  expect((await app.inject({ url: `/api/v1/verify/${next}/pdf` })).statusCode).toBe(200);
});

it("limita hash por IP y copia tanto por IP como por código normalizado con no-store incluso en 429", async () => {
  const fixture = await signingFixture(app, 1);
  const contract = await fixture.seal();
  for (let index = 0; index < 11; index++) {
    const result = await app.inject({
      method: "POST",
      url: "/api/v1/verify/hash",
      payload: { code: "bad", sha256: "0".repeat(64) },
    });
    expect(result.statusCode).toBe(index < 10 ? 200 : 429);
    expect(result.headers["cache-control"]).toBe("no-store");
  }
  for (let index = 0; index < 6; index++) {
    const code =
      index % 2
        ? contract.verificationCode!.toLowerCase().replace(/-/g, "")
        : contract.verificationCode;
    const result = await app.inject({
      url: `/api/v1/verify/${code}/pdf`,
      remoteAddress: `192.0.2.${index + 1}`,
    });
    expect(result.statusCode, result.body).toBe(index < 5 ? 200 : 429);
    expect(result.headers["cache-control"]).toBe("no-store");
  }
  for (let index = 0; index < 4; index++) {
    const result = await app.inject({
      url: "/api/v1/verify/0000-0000-0000-0000/pdf",
      remoteAddress: "192.0.2.100",
    });
    expect(result.statusCode).toBe(index < 3 ? 404 : 429);
  }
});

it("una consulta que concurre con rotación usa una instantánea y nunca revela el código nuevo", async () => {
  const fixture = await signingFixture(app, 1);
  const contract = await fixture.seal();
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const get = storage.get.bind(storage);
  let paused = false;
  vi.spyOn(storage, "get").mockImplementation(async (key) => {
    if (!paused && key.startsWith("contracts/")) {
      paused = true;
      enter();
      await released;
    }
    return get(key);
  });
  const lookup = app
    .inject({ url: "/api/v1/verify/" + contract.verificationCode })
    .then((response) => response);
  await entered;
  const rotation = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${contract.id}/verification-code/rotate`,
    headers: fixture.admin.headers,
    payload: { reason: "Rotación concurrente" },
  });
  release();
  expect(rotation.statusCode, rotation.body).toBe(200);
  const response = await lookup;
  expect(response.json()).toMatchObject({ status: "registered", code: contract.verificationCode });
  expect(response.body).not.toContain(rotation.json().verificationCode);
  expect((await app.inject({ url: "/api/v1/verify/" + contract.verificationCode })).json()).toEqual(
    { status: "revoked" },
  );
});
