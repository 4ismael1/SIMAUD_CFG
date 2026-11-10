import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool, cleanDatabase, prepareDatabase, createUser } from "./helpers.js";
import {
  contracts,
  contractVersions,
  contractSignatories,
  contractRenewals,
  templateVariables,
  contractTemplates,
} from "../src/db/schema.js";
import { snapshot } from "../src/modules/contracts/service.js";
import { contractFixture, loginUser, testApp } from "./t09b-helpers.js";

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

it("crear y editar por HTTP guardan definiciones independientes por versión", async () => {
  const actor = await loginUser(app, { role: "admin" });
  const [variable] = await db
    .insert(templateVariables)
    .values({ name: "plan", label: "Plan", type: "select", options: ["A"], required: true })
    .returning();
  const [template] = await db
    .insert(contractTemplates)
    .values({ title: "Plantilla", content: "Plan {{plan}}", variables: ["plan"] })
    .returning();
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/contracts",
    headers: actor.headers,
    payload: {
      templateId: template!.id,
      title: "Contrato",
      variables: { plan: "A" },
      value: "100.00",
      startDate: "2026-11-01",
      endDate: "2027-11-01",
      signatories: [
        {
          name: actor.user.name,
          email: actor.user.email,
          cedula: actor.user.cedula,
          role: "client",
          signingOrder: 1,
        },
      ],
    },
  });
  expect(created.statusCode, created.body).toBe(201);
  await db
    .update(templateVariables)
    .set({ type: "text", options: null, required: false })
    .where(eq(templateVariables.id, variable!.id));
  const edited = await app.inject({
    method: "PATCH",
    url: `/api/v1/contracts/${created.json().id}`,
    headers: actor.headers,
    payload: { title: "Nuevo título", variables: { plan: "Texto" } },
  });
  expect(edited.statusCode, edited.body).toBe(200);
  const versions = await db.select().from(contractVersions).orderBy(contractVersions.versionNumber);
  expect(versions.map((version) => version.snapshot)).toMatchObject([
    { variableDefinitions: [{ name: "plan", type: "select", required: true, options: ["A"] }] },
    { variableDefinitions: [{ name: "plan", type: "text", required: false, options: null }] },
  ]);
});

it("protege variables históricas y renueva desde su snapshot aunque cambie o desaparezca el catálogo", async () => {
  const admin = await loginUser(app, { role: "admin" });
  const [variable] = await db
    .insert(templateVariables)
    .values({ name: "plan", label: "Plan", type: "select", options: ["A"], required: true })
    .returning();
  const parent = await contractFixture(admin.user.id, {
    status: "active",
    content: "Plan {{plan}}",
    generatedContent: "Plan A",
    variablesData: { plan: "A" },
  });
  await db.transaction((tx) => snapshot(tx, parent, admin.user, "Creación"));
  const [version] = await db.select().from(contractVersions);
  expect(version!.snapshot).toMatchObject({
    variableDefinitions: [{ name: "plan", type: "select", required: true, options: ["A"] }],
  });
  const deletion = await app.inject({
    method: "DELETE",
    url: `/api/v1/variables/${variable!.id}`,
    headers: admin.headers,
  });
  expect(deletion.statusCode, deletion.body).toBe(409);
  await db
    .update(templateVariables)
    .set({ type: "date", options: null })
    .where(eq(templateVariables.id, variable!.id));
  // Archived contracts may release catalog entries; their historical definitions remain usable.
  await db.update(contracts).set({ archived: true }).where(eq(contracts.id, parent.id));
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: `/api/v1/variables/${variable!.id}`,
        headers: admin.headers,
      })
    ).statusCode,
  ).toBe(200);
  const request = await app.inject({
    method: "POST",
    url: "/api/v1/renewals",
    headers: admin.headers,
    payload: {
      contractId: parent.id,
      proposedStartDate: "2027-11-01",
      proposedEndDate: "2028-11-01",
      proposedValue: "200.00",
      reason: "Continuidad",
    },
  });
  expect(request.statusCode, request.body).toBe(201);
  const approved = await app.inject({
    method: "POST",
    url: `/api/v1/renewals/${request.json().id}/approve`,
    headers: admin.headers,
    payload: {},
  });
  expect(approved.statusCode, approved.body).toBe(200);
  const childId = approved.json().newContractId as string;
  const [child] = await db.select().from(contracts).where(eq(contracts.id, childId));
  expect(child!.generatedContent).toBe("Plan A");
  const [childVersion] = await db
    .select()
    .from(contractVersions)
    .where(eq(contractVersions.contractId, childId));
  expect(childVersion!.snapshot).toMatchObject({
    variableDefinitions: [{ name: "plan", type: "select", required: true, options: ["A"] }],
  });
});

const forbiddenFields = [
  "content",
  "generatedContent",
  "variablesData",
  "signedPdfPath",
  "signedPdfSha256",
  "signaturePath",
  "ip",
  "userAgent",
  "acceptedDeclarationAt",
];
function expectSummary(summary: Record<string, unknown>) {
  for (const name of forbiddenFields) expect(summary).not.toHaveProperty(name);
  expect(summary).toMatchObject({
    title: "Contrato seguridad",
    contractValue: "100.00",
    creator: { name: "Usuario prueba" },
    signatures: { total: 1 },
  });
  for (const name of forbiddenFields) expect(summary.signatory).not.toHaveProperty(name);
}

it("pagina firmas por estado y las tres listas devuelven solo resúmenes sin documento ni storage", async () => {
  const actor = await loginUser(app);
  const creator = await createUser({ role: "gestor" });
  const parents = [];
  for (let index = 0; index < 3; index++) {
    const contract = await contractFixture(creator.id, {
      status: index === 2 ? "active" : "pending_signatures",
      content: "CONFIDENCIAL",
      generatedContent: "CONFIDENCIAL",
      variablesData: { secret: "value" },
      signedPdfPath: "internal.pdf",
      signedPdfSha256: "hash",
    });
    parents.push(contract);
    await db.insert(contractSignatories).values({
      contractId: contract.id,
      userId: actor.user.id,
      name: actor.user.name,
      email: actor.user.email,
      role: "client",
      signingOrder: 1,
      status: index === 2 ? "signed" : "pending",
      signaturePath: "private.png",
      ip: "private",
    });
  }
  const inbox = await app.inject({
    url: "/api/v1/me/signatures?status=pending&pageSize=1",
    headers: actor.headers,
  });
  expect(inbox.statusCode, inbox.body).toBe(200);
  expect(inbox.json().meta).toEqual({ page: 1, pageSize: 1, total: 2 });
  expect(inbox.json().data).toHaveLength(1);
  expectSummary(inbox.json().data[0]);
  expect(inbox.json().data[0].myTurn).toBe(true);
  const empty = await app.inject({
    url: "/api/v1/me/signatures?status=pending&page=9&pageSize=1",
    headers: actor.headers,
  });
  expect(empty.json()).toMatchObject({ data: [], meta: { total: 2 } });
  const signed = await app.inject({
    url: "/api/v1/me/signatures?status=signed",
    headers: actor.headers,
  });
  expect(signed.json().meta.total).toBe(1);
  expect(signed.json().data[0].myTurn).toBe(false);
  const eligible = await app.inject({ url: "/api/v1/renewals/eligible", headers: actor.headers });
  expect(eligible.statusCode).toBe(200);
  expect(eligible.json()).toHaveLength(1);
  expectSummary(eligible.json()[0]);
  await db.insert(contractRenewals).values({
    originalContractId: parents[2]!.id,
    requestedBy: actor.user.id,
    proposedValue: "120.00",
    proposedStartDate: "2027-11-01",
    proposedEndDate: "2028-11-01",
  });
  const renewals = await app.inject({ url: "/api/v1/renewals", headers: actor.headers });
  expect(renewals.statusCode).toBe(200);
  expectSummary(renewals.json().data[0].contract);
  const outsider = await loginUser(app);
  const hidden = await app.inject({ url: "/api/v1/me/signatures", headers: outsider.headers });
  expect(hidden.json().data).toEqual([]);
});
