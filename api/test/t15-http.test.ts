import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { cleanDatabase, db, pool, prepareDatabase } from "./helpers.js";
import { imageMultipart, loginUser, testApp, validPng } from "./t09b-helpers.js";
import { contracts, signatureEvidence, templateVariables } from "../src/db/schema.js";
import { contentDocumentHash } from "../src/lib/rich-doc/content.js";
import { storage } from "../src/lib/storage.js";
import { sha256 } from "../src/lib/crypto/canonical.js";
import { saveFinalPdf } from "../src/modules/contracts/pdf.js";

let app: FastifyInstance;
let admin: Awaited<ReturnType<typeof loginUser>>;
const document = {
  type: "doc",
  attrs: {
    page: { size: "legal", font: "sans", fontSize: 12, lineHeight: 1.15 },
    footer: { center: { kind: "pageNumber" } },
  },
  content: [
    {
      type: "heading",
      attrs: { level: 2, numbered: "ordinal" },
      content: [{ type: "variable", attrs: { name: "cliente" } }],
    },
    {
      type: "signatures",
      attrs: { columns: 3 },
      content: [{ type: "signatureSlot", attrs: { label: "EL CLIENTE" } }],
    },
  ],
};

beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
  admin = await loginUser(app, { role: "admin" });
  await db
    .insert(templateVariables)
    .values({ name: "cliente", label: "Nombre del cliente", type: "text", required: true });
});
afterEach(() => app?.close());
afterAll(() => pool.end());

function request(
  method: "GET" | "POST" | "PATCH",
  path: string,
  payload?: object,
  headers = admin.headers,
) {
  return app.inject({ method, url: "/api/v1" + path, headers, ...(payload ? { payload } : {}) });
}
async function createTemplate() {
  const response = await request("POST", "/templates", {
    title: "Premium",
    contentFormat: "rich-v2",
    content: document,
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<{ id: string }>().id;
}
async function createContract() {
  const response = await request("POST", "/contracts", {
    templateId: await createTemplate(),
    title: "Premium",
    variables: { cliente: "Ana Premium" },
    value: "100.00",
    startDate: "2026-11-01",
    endDate: "2027-11-01",
    signatories: [
      { name: admin.user.name, email: admin.user.email, slotIndex: 0, signingOrder: 1 },
    ],
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<{ id: string }>().id;
}

it("publica capacidades solo al personal y limita el preview PDF por usuario", async () => {
  expect((await request("GET", "/templates/capabilities")).json()).toEqual({
    formats: ["plain", "rich-v1", "rich-v2"],
    paperSizes: ["letter", "legal", "a4"],
    fonts: ["serif", "sans"],
    previewPdf: true,
  });
  const user = await loginUser(app);
  expect(
    (await request("GET", "/templates/capabilities", undefined, user.headers)).statusCode,
  ).toBe(403);
  const payload = { contentFormat: "rich-v2", content: document, title: "Vista previa" };
  expect((await request("POST", "/templates/preview-pdf", payload, user.headers)).statusCode).toBe(
    403,
  );
  for (let index = 0; index < 20; index++) {
    const response = await request("POST", "/templates/preview-pdf", payload);
    expect(response.statusCode, response.body.slice(0, 100)).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  }
  expect((await request("POST", "/templates/preview-pdf", payload)).statusCode).toBe(429);
  const supervisor = await loginUser(app, { role: "supervisor" });
  expect(
    (await request("POST", "/templates/preview-pdf", payload, supervisor.headers)).statusCode,
  ).toBe(200);
});

it("valida tamaño, formato, estructura, variables y acceso del gestor al preview PDF", async () => {
  const payload = { contentFormat: "rich-v2", content: document, title: "Vista previa" };
  const gestor = await loginUser(app, { role: "gestor" });
  expect(
    (await request("POST", "/templates/preview-pdf", payload, gestor.headers)).statusCode,
  ).toBe(403);
  await createTemplate();
  expect(
    (await request("POST", "/templates/preview-pdf", payload, gestor.headers)).statusCode,
  ).toBe(200);
  const malformed = { ...payload, content: { ...document, attrs: { page: { size: "a3" } } } };
  expect((await request("POST", "/templates/preview-pdf", malformed)).statusCode).toBe(400);
  expect(
    (await request("POST", "/templates/preview-pdf", { ...payload, contentFormat: "html" }))
      .statusCode,
  ).toBe(400);
  expect(
    (
      await request("POST", "/templates/preview-pdf", {
        ...payload,
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "variable", attrs: { name: "desconocida" } }] },
          ],
        },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await request("POST", "/templates/preview-pdf", {
        content: "x".repeat(700000),
        title: "Grande",
      })
    ).statusCode,
  ).toBe(413);
  expect(
    (
      await request("POST", "/templates/preview-pdf", {
        content: "Hola {{cliente}}",
        title: "Plano",
      })
    ).statusCode,
  ).toBe(200);
});

it("persiste v2 en catálogo, contratos y versiones y bloquea degradar a plain", async () => {
  const id = await createContract();
  const detail = await request("GET", `/contracts/${id}`);
  expect(detail.json()).toMatchObject({ contentFormat: "rich-v2", content: document });
  expect((await request("PATCH", `/contracts/${id}`, { title: "Editado" })).json()).toMatchObject({
    contentFormat: "rich-v2",
    currentVersion: 2,
  });
  const versions = await request("GET", `/contracts/${id}/versions`);
  expect(versions.json()).toHaveLength(2);
  expect(versions.json()[0]).toMatchObject({ contentFormat: "rich-v2", content: document });
  const templateId = await createTemplate();
  expect(
    (
      await request("PATCH", `/templates/${templateId}`, {
        contentFormat: "plain",
        content: "Texto",
      })
    ).statusCode,
  ).toBe(400);
  expect((await request("POST", `/templates/${templateId}/duplicate`)).json()).toMatchObject({
    contentFormat: "rich-v2",
    content: document,
  });
  const preview = await request("POST", "/templates/preview", {
    contentFormat: "rich-v2",
    content: document,
    values: { cliente: "Ana" },
  });
  expect(preview.json()).toMatchObject({
    contentFormat: "rich-v2",
    document: { attrs: document.attrs },
    missing: [],
  });
});

it("estampa, sella y conserva los bytes finales v2 y detecta cambios de maqueta", async () => {
  const id = await createContract();
  await db.update(contracts).set({ status: "pending_signatures" }).where(eq(contracts.id, id));
  const [current] = await db.select().from(contracts).where(eq(contracts.id, id));
  const signed = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${id}/sign`,
    headers: { ...admin.headers, "content-type": "multipart/form-data; boundary=t09b" },
    payload: imageMultipart(validPng(), {
      acceptedDeclaration: "true",
      viewedAt: current!.updatedAt.toISOString(),
      method: "drawn",
    }),
  });
  expect(signed.statusCode, signed.body).toBe(200);
  const [sealed] = await db.select().from(contracts).where(eq(contracts.id, id));
  const [evidence] = await db
    .select()
    .from(signatureEvidence)
    .where(eq(signatureEvidence.contractId, id));
  const bytes = await storage.get("contracts/" + sealed!.signedPdfPath);
  expect(sha256(bytes)).toBe(sealed!.signedPdfSha256);
  expect(evidence!.payload.documentSha256).toBe(
    contentDocumentHash(sealed!.generatedContent!, "rich-v2"),
  );
  await db.transaction((tx) => saveFinalPdf(tx, sealed!));
  expect(await storage.get("contracts/" + sealed!.signedPdfPath)).toEqual(bytes);
  const download = await request("GET", `/contracts/${id}/pdf`);
  expect(download.rawPayload).toEqual(bytes);
  expect((await request("GET", `/verify/${sealed!.verificationCode}`)).json()).toMatchObject({
    status: "registered",
    systemSignatureValid: true,
  });
  await db
    .update(contracts)
    .set({ generatedContent: sealed!.generatedContent!.replace('"legal"', '"a4"') })
    .where(eq(contracts.id, id));
  expect((await request("GET", `/verify/${sealed!.verificationCode}`)).json().status).toBe(
    "integrity_error",
  );
});
