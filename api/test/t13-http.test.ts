import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { cleanDatabase, db, pool, prepareDatabase } from "./helpers.js";
import { imageMultipart, loginUser, testApp, validPng } from "./t09b-helpers.js";
import {
  contracts,
  contractTemplates,
  contractSignatories,
  contractVersions,
  signatureEvidence,
  templateVariables,
} from "../src/db/schema.js";
import { contentDocumentHash } from "../src/lib/rich-doc/content.js";
import { canonicalRichDoc } from "../src/lib/rich-doc/schema.js";
import { verifyEvidenceChain } from "../src/modules/contracts/evidence.js";
import { storage } from "../src/lib/storage.js";
import { sha256 } from "../src/lib/crypto/canonical.js";

let app: FastifyInstance;
let admin: Awaited<ReturnType<typeof loginUser>>;
const document = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1, textAlign: "center" },
      content: [
        { type: "text", text: "Literal {{literal}} " },
        { type: "variable", attrs: { name: "cliente" }, marks: [{ type: "bold" }] },
      ],
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
    .values({ name: "cliente", label: "Cliente", type: "text", required: true });
});
afterEach(() => app.close());
afterAll(() => pool.end());

function request(
  method: "GET" | "POST" | "PATCH",
  path: string,
  payload?: object,
  headers = admin.headers,
) {
  return app.inject({ method, url: "/api/v1" + path, headers, ...(payload ? { payload } : {}) });
}

async function createTemplate(content: unknown = document) {
  const response = await request("POST", "/templates", {
    title: "Documento con formato",
    contentFormat: "rich-v1",
    content,
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<{ id: string }>().id;
}

async function createContract(templateId: string) {
  const response = await request("POST", "/contracts", {
    templateId,
    title: "Contrato con formato",
    variables: { cliente: "Ana & <Sociedad>" },
    value: "100.00",
    startDate: "2026-11-01",
    endDate: "2027-11-01",
    signatories: [
      { name: admin.user.name, email: admin.user.email, role: "client", signingOrder: 1 },
    ],
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<{
    id: string;
    contentFormat: string;
    content: unknown;
    generatedContent: unknown;
  }>();
}

it("publica formatos y objetos en catálogo, preview, contrato, versiones y aprobaciones", async () => {
  const templateId = await createTemplate();
  for (const path of ["/templates", `/templates/${templateId}`]) {
    const response = await request("GET", path);
    const body = path === "/templates" ? response.json()[0] : response.json();
    expect(body).toMatchObject({
      contentFormat: "rich-v1",
      content: document,
      variables: ["cliente"],
    });
  }
  const preview = await request("POST", "/templates/preview", {
    contentFormat: "rich-v1",
    content: document,
    values: {},
  });
  expect(preview.json()).toMatchObject({
    contentFormat: "rich-v1",
    document,
    missing: ["cliente"],
  });
  const plainPreview = await request("POST", "/templates/preview", {
    content: "{{cliente}}",
    values: { cliente: "<Ana>" },
  });
  expect(plainPreview.json()).toEqual({ contentFormat: "plain", html: "&lt;Ana&gt;", missing: [] });
  const duplicate = await request("POST", `/templates/${templateId}/duplicate`);
  expect(duplicate.json()).toMatchObject({ contentFormat: "rich-v1", content: document });
  const created = await createContract(templateId);
  expect(created).toMatchObject({ contentFormat: "rich-v1", content: document });
  expect(created.generatedContent).toMatchObject({
    content: [
      {
        content: [
          { type: "text", text: "Literal {{literal}} " },
          { type: "text", text: "Ana & <Sociedad>", marks: [{ type: "bold" }] },
        ],
      },
    ],
  });
  const [stored] = await db.select().from(contracts).where(eq(contracts.id, created.id));
  expect(stored!.content).toBe(canonicalRichDoc(document));
  expect(stored!.generatedContent).toBe(canonicalRichDoc(created.generatedContent));
  const edited = await request("PATCH", `/contracts/${created.id}`, { title: "Contrato editado" });
  expect(edited.json()).toMatchObject({
    contentFormat: "rich-v1",
    content: document,
    currentVersion: 2,
  });
  const versions = await request("GET", `/contracts/${created.id}/versions`);
  expect(versions.json()).toHaveLength(2);
  expect(versions.json()[0]).toMatchObject({ contentFormat: "rich-v1", content: document });
  expect((await request("GET", `/contracts/${created.id}/versions/2`)).json()).toMatchObject({
    contentFormat: "rich-v1",
    content: document,
  });
  expect((await request("POST", `/contracts/${created.id}/submit`)).statusCode).toBe(200);
  expect((await request("GET", "/approvals")).json()[0].version).toMatchObject({
    contentFormat: "rich-v1",
    content: document,
  });
});

it("permite convertir plain a rich-v1 y bloquea la conversión inversa con y sin contenido", async () => {
  const plain = await request("POST", "/templates", {
    title: "Anterior",
    content: "Texto {{cliente}}",
  });
  expect(plain.json()).toMatchObject({ contentFormat: "plain", content: "Texto {{cliente}}" });
  const path = `/templates/${plain.json().id}`;
  const converted = await request("PATCH", path, { contentFormat: "rich-v1", content: document });
  expect(converted.statusCode, converted.body).toBe(200);
  expect(converted.json()).toMatchObject({ contentFormat: "rich-v1", content: document });
  expect((await request("PATCH", path, { title: "Nuevo título" })).json().contentFormat).toBe(
    "rich-v1",
  );
  expect((await request("PATCH", path, { contentFormat: "plain" })).statusCode).toBe(400);
  expect(
    (await request("PATCH", path, { contentFormat: "plain", content: "Texto" })).statusCode,
  ).toBe(400);
  expect((await request("PATCH", path + "/status", { status: "inactive" })).json().content).toEqual(
    document,
  );
  const created = await createContract(plain.json().id);
  expect(
    (await request("PATCH", `/contracts/${created.id}`, { content: "Texto" })).statusCode,
  ).toBe(400);
  expect(
    (
      await request("PATCH", `/contracts/${created.id}`, {
        content: { type: "doc", content: [{ type: "paragraph" }] },
        variables: {},
      })
    ).statusCode,
  ).toBe(200);
});

it("conserva permisos, variables requeridas, desconocidas y validación estricta por HTTP", async () => {
  const templateId = await createTemplate();
  const gestor = await loginUser(app, { role: "gestor" });
  const other = await loginUser(app, { role: "gestor" });
  const user = await loginUser(app);
  expect(
    (
      await request(
        "POST",
        "/templates",
        { title: "Ajena", contentFormat: "rich-v1", content: document },
        gestor.headers,
      )
    ).statusCode,
  ).toBe(403);
  expect(
    (await request("GET", `/templates/${templateId}`, undefined, user.headers)).statusCode,
  ).toBe(403);
  const invalid = await request("POST", "/templates/preview", {
    contentFormat: "rich-v1",
    content: { type: "doc", content: [{ type: "paragraph", attrs: { onclick: "x" } }] },
    values: {},
  });
  expect(invalid.statusCode).toBe(400);
  expect(invalid.json().error.code).toBe("VALIDATION_ERROR");
  expect(
    (
      await request("POST", "/templates", {
        title: "Inválida",
        contentFormat: "rich-v1",
        content: "{}",
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (await request("POST", "/templates", { title: "Inválida", content: document })).statusCode,
  ).toBe(400);
  const unknown = structuredClone(document);
  unknown.content[0]!.content[1]!.attrs!.name = "desconocida";
  expect(
    (
      await request("POST", "/templates/preview", {
        contentFormat: "rich-v1",
        content: unknown,
        values: {},
      })
    ).statusCode,
  ).toBe(400);
  const created = await createContract(templateId);
  expect((await request("PATCH", `/contracts/${created.id}`, { variables: {} })).statusCode).toBe(
    400,
  );
  expect(
    (await request("PATCH", `/contracts/${created.id}`, { variables: { desconocida: "x" } }))
      .statusCode,
  ).toBe(400);
  expect(
    (await request("GET", `/contracts/${created.id}`, undefined, other.headers)).statusCode,
  ).toBe(404);
  await request("PATCH", `/templates/${templateId}/status`, { status: "inactive" });
  expect(
    (
      await request(
        "POST",
        "/templates/preview",
        { contentFormat: "rich-v1", content: document, values: { cliente: "Ana" } },
        gestor.headers,
      )
    ).statusCode,
  ).toBe(403);
});

it("firma rich-v1, sella el PDF final y conserva el hash canónico en evidencia y verificación", async () => {
  const created = await createContract(await createTemplate());
  await db
    .update(contracts)
    .set({ status: "pending_signatures" })
    .where(eq(contracts.id, created.id));
  const [current] = await db.select().from(contracts).where(eq(contracts.id, created.id));
  const signed = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${created.id}/sign`,
    headers: { ...admin.headers, "content-type": "multipart/form-data; boundary=t09b" },
    payload: imageMultipart(validPng(), {
      acceptedDeclaration: "true",
      viewedAt: current!.updatedAt.toISOString(),
      method: "drawn",
    }),
  });
  expect(signed.statusCode, signed.body).toBe(200);
  const [sealed] = await db.select().from(contracts).where(eq(contracts.id, created.id));
  const [evidence] = await db
    .select()
    .from(signatureEvidence)
    .where(eq(signatureEvidence.contractId, created.id));
  const expected = contentDocumentHash(sealed!.generatedContent!, "rich-v1");
  expect(sealed!.documentSha256).toBe(expected);
  expect(evidence!.payload.documentSha256).toBe(expected);
  expect(await verifyEvidenceChain(created.id)).toBe(true);
  expect(sha256(await storage.get("contracts/" + sealed!.signedPdfPath))).toBe(
    sealed!.signedPdfSha256,
  );
  const verification = await request("GET", `/verify/${sealed!.verificationCode}`);
  expect(verification.json()).toMatchObject({
    status: "valid",
    documentSha256: expected,
    systemSignatureValid: true,
  });
  expect((await request("PATCH", `/contracts/${created.id}`, { title: "Cambio" })).statusCode).toBe(
    409,
  );
  const [oldVersion] = await db
    .select()
    .from(contractVersions)
    .where(eq(contractVersions.contractId, created.id));
  await db.update(contracts).set({ currentVersion: 2 }).where(eq(contracts.id, created.id));
  await db
    .update(contractSignatories)
    .set({ status: "pending" })
    .where(eq(contractSignatories.contractId, created.id));
  expect(await verifyEvidenceChain(created.id)).toBe(true);
  await db
    .update(contractVersions)
    .set({ generatedContent: oldVersion!.generatedContent!.replace('"bold"', '"italic"') })
    .where(eq(contractVersions.id, oldVersion!.id));
  expect(await verifyEvidenceChain(created.id)).toBe(false);
});

it("renueva desde el snapshot rich-v1 aunque el catálogo cambie", async () => {
  const created = await createContract(await createTemplate());
  await db.update(contracts).set({ status: "active" }).where(eq(contracts.id, created.id));
  await db
    .update(templateVariables)
    .set({ name: "renombrada" })
    .where(eq(templateVariables.name, "cliente"));
  const renewal = await request("POST", "/renewals", {
    contractId: created.id,
    proposedStartDate: "2027-11-01",
    proposedEndDate: "2028-11-01",
    proposedValue: "200.00",
    reason: "Continuidad del servicio",
  });
  expect(renewal.statusCode, renewal.body).toBe(201);
  const approved = await request("POST", `/renewals/${renewal.json().id}/approve`, {});
  expect(approved.statusCode, approved.body).toBe(200);
  const child = await request("GET", `/contracts/${approved.json().newContractId}`);
  expect(child.json()).toMatchObject({
    contentFormat: "rich-v1",
    content: document,
    generatedContent: created.generatedContent,
  });
  const version = await request("GET", `/contracts/${approved.json().newContractId}/versions/1`);
  expect(version.json()).toMatchObject({
    contentFormat: "rich-v1",
    snapshot: { variableDefinitions: [{ name: "cliente", type: "text" }] },
  });
});

it("las tres columnas conservan plain por defecto y rechazan formatos desconocidos", async () => {
  const [plain] = await db
    .insert(contractTemplates)
    .values({ title: "Anterior", content: "Texto {{cliente}}" })
    .returning();
  expect(plain!.contentFormat).toBe("plain");
  const created = await createContract(plain!.id);
  expect(created.contentFormat).toBe("plain");
  const [version] = await db
    .select()
    .from(contractVersions)
    .where(eq(contractVersions.contractId, created.id));
  expect(version!.contentFormat).toBe("plain");
  for (const table of ["contract_templates", "contracts", "contract_versions"])
    await expect(
      db.execute(sql.raw(`update ${table} set content_format = 'html'`)),
    ).rejects.toThrow();
});
