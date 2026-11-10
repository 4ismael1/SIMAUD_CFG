import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { cleanDatabase, db, pool, prepareDatabase } from "./helpers.js";
import { testApp } from "./t09b-helpers.js";
import { signingFixture, current, post, sign, approve, setApp } from "./t17-helpers.js";
import { contracts, contractSignatories, contractVersions } from "../src/db/schema.js";
import { publicVerification } from "../src/modules/verify/service.js";
let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
  setApp(app);
});
afterEach(() => app.close());
afterAll(() => pool.end());

it("no reabre una enmienda cancelada si otra ya sustituyó al original", async () => {
  const fixture = await signingFixture(app, 1);
  await fixture.seal();
  const first = await post(fixture.contract.id, "amendments", fixture.admin.headers, {
    reason: "Primera",
  });
  const firstId = first.json().id as string;
  await approve(firstId, fixture.admin.headers);
  expect(
    (
      await post(firstId, "cancel", fixture.admin.headers, {
        reason: "other",
        description: "Otra corrección",
      })
    ).statusCode,
  ).toBe(200);
  const second = await post(fixture.contract.id, "amendments", fixture.admin.headers, {
    reason: "Segunda",
  });
  const secondId = second.json().id as string;
  expect((await post(firstId, "uncancel", fixture.admin.headers)).statusCode).toBe(409);
  await approve(secondId, fixture.admin.headers);
  expect((await sign(secondId, fixture.actors[0]!.headers)).statusCode).toBe(200);
  expect((await post(firstId, "uncancel", fixture.admin.headers)).statusCode).toBe(409);
  expect(
    (
      await post(firstId, "override-status", fixture.admin.headers, {
        status: "pending_signatures",
        reason: "Restaurar",
      })
    ).statusCode,
  ).toBe(409);
  expect((await current(firstId)).status).toBe("cancelled");
  expect((await current(fixture.contract.id)).amendedByContractId).toBe(secondId);
});

it("copia rich-v2, formato premium y definiciones históricas sin heredar firmas ni colocaciones", async () => {
  const fixture = await signingFixture(app, 1);
  const content = JSON.stringify({
    type: "doc",
    attrs: { page: { size: "legal", font: "sans" } },
    content: [{ type: "paragraph", content: [{ type: "text", text: "Cláusula con formato" }] }],
  });
  await db
    .update(contracts)
    .set({ content, generatedContent: content, contentFormat: "rich-v2" })
    .where(eq(contracts.id, fixture.contract.id));
  await db
    .update(contractVersions)
    .set({ content, generatedContent: content, contentFormat: "rich-v2" })
    .where(eq(contractVersions.contractId, fixture.contract.id));
  const original = await fixture.seal();
  const response = await post(original.id, "amendments", fixture.admin.headers, {
    reason: "Corregir formato",
  });
  expect(response.statusCode, response.body).toBe(201);
  const child = await current(response.json().id);
  expect(child).toMatchObject({
    content,
    generatedContent: content,
    contentFormat: "rich-v2",
    signedPdfPath: null,
  });
  const signers = await db
    .select()
    .from(contractSignatories)
    .where(eq(contractSignatories.contractId, child.id));
  expect(signers[0]).toMatchObject({
    status: "pending",
    signingOrder: 1,
    signaturePath: null,
    placement: null,
    signedAt: null,
  });
  const [version] = await db
    .select()
    .from(contractVersions)
    .where(eq(contractVersions.contractId, child.id));
  expect(version!.snapshot).toMatchObject({ variableDefinitions: [] });
  await approve(child.id, fixture.admin.headers);
  expect((await sign(child.id, fixture.actors[0]!.headers)).statusCode).toBe(200);
  expect(await publicVerification(original.verificationCode!)).toMatchObject({
    status: "amended",
    systemSignatureValid: true,
  });
});

it("rechaza enmiendas antes del PDF final y mientras hay una renovación en curso", async () => {
  const fixture = await signingFixture(app, 1);
  expect(
    (await post(fixture.contract.id, "amendments", fixture.admin.headers, { reason: "Corregir" }))
      .statusCode,
  ).toBe(409);
  await fixture.seal();
  const renewal = await app.inject({
    method: "POST",
    url: "/api/v1/renewals",
    headers: fixture.admin.headers,
    payload: {
      contractId: fixture.contract.id,
      proposedStartDate: "2027-11-01",
      proposedEndDate: "2028-11-01",
      proposedValue: "100.00",
      reason: "Renovar",
    },
  });
  expect(renewal.statusCode, renewal.body).toBe(201);
  expect(
    (await post(fixture.contract.id, "amendments", fixture.admin.headers, { reason: "Corregir" }))
      .statusCode,
  ).toBe(409);
  const detail = await app.inject({
    url: `/api/v1/contracts/${fixture.contract.id}`,
    headers: fixture.admin.headers,
  });
  expect(detail.json().can.amend).toBe(false);
});
