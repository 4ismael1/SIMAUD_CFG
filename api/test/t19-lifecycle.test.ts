import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { cleanDatabase, db, pool, prepareDatabase, signIn, authorization } from "./helpers.js";
import { testApp, imageMultipart, validPng } from "./t09b-helpers.js";
import { roleFixture, labels } from "./t19-helpers.js";
import { contracts, notifications } from "../src/db/schema.js";
import { publicVerification } from "../src/modules/verify/service.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
});
afterEach(() => app.close());
afterAll(() => pool.end());

it("firma en otro orden conservando geometría, roles en bandeja y avisos y privacidad pública", async () => {
  const fixture = await roleFixture(app);
  const response = await fixture.create({
    ...fixture.input,
    signatories: fixture.input.signatories.map((signer, index) => ({
      ...signer,
      signingOrder: [3, 1, 2, 4][index],
    })),
  });
  expect(response.statusCode, response.body).toBe(201);
  const id = response.json().id as string;
  for (const action of ["submit", "approve"]) {
    const result = await app.inject({
      method: "POST",
      url: `/api/v1/contracts/${id}/${action}`,
      headers: fixture.admin.headers,
      payload: {},
    });
    expect(result.statusCode, result.body).toBe(200);
  }
  const notice = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, fixture.people[1]!.id));
  expect(notice[0]!.data).toMatchObject({ roleLabel: labels[1], slotIndex: 1 });
  for (const index of [1, 2, 0, 3]) {
    const headers = authorization((await signIn(app, fixture.people[index]!)).token);
    const detail = await app.inject({ url: `/api/v1/contracts/${id}`, headers });
    expect(detail.json().signatureSlot.slotIndex).toBe(index);
    const inbox = await app.inject({ url: "/api/v1/me/signatures", headers });
    expect(inbox.statusCode, inbox.body).toBe(200);
    expect(inbox.json().data[0].signatory).toMatchObject({
      roleLabel: index < 3 ? labels[index] : "Testigo",
      slotIndex: index < 3 ? index : null,
    });
    const [current] = await db.select().from(contracts).where(eq(contracts.id, id));
    const signed = await app.inject({
      method: "POST",
      url: `/api/v1/contracts/${id}/sign`,
      headers: { ...headers, "content-type": "multipart/form-data; boundary=t09b" },
      payload: imageMultipart(validPng(), {
        acceptedDeclaration: "true",
        viewedAt: current!.updatedAt.toISOString(),
      }),
    });
    expect(signed.statusCode, signed.body).toBe(200);
  }
  const [sealed] = await db.select().from(contracts).where(eq(contracts.id, id));
  const verified = await publicVerification(sealed!.verificationCode!);
  expect(verified).toMatchObject({ status: "registered", evidenceChainValid: true });
  expect(JSON.stringify(verified)).not.toMatch(/roleLabel|slotIndex|cargo|@|cedula|position/);
  const amendment = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${id}/amendments`,
    headers: fixture.admin.headers,
    payload: { reason: "Corregir cláusula" },
  });
  expect(amendment.statusCode, amendment.body).toBe(201);
  const childId = amendment.json().id as string;
  const child = await app.inject({
    url: `/api/v1/contracts/${childId}`,
    headers: fixture.admin.headers,
  });
  expect(
    child
      .json()
      .signatories.map(
        ({
          roleLabel,
          slotIndex,
          signingOrder,
        }: {
          roleLabel: string;
          slotIndex: number | null;
          signingOrder: number;
        }) => ({ roleLabel, slotIndex, signingOrder }),
      ),
  ).toEqual([
    { roleLabel: labels[1], slotIndex: 1, signingOrder: 1 },
    { roleLabel: labels[2], slotIndex: 2, signingOrder: 2 },
    { roleLabel: labels[0], slotIndex: 0, signingOrder: 3 },
    { roleLabel: "Testigo", slotIndex: null, signingOrder: 4 },
  ]);
  const cancelled = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${childId}/cancel`,
    headers: fixture.admin.headers,
    payload: { reason: "other", description: "Optamos por renovar" },
  });
  expect(cancelled.statusCode, cancelled.body).toBe(200);
  const renewal = await app.inject({
    method: "POST",
    url: "/api/v1/renewals",
    headers: fixture.admin.headers,
    payload: {
      contractId: id,
      proposedStartDate: "2027-11-01",
      proposedEndDate: "2028-11-01",
      proposedValue: "100.00",
      reason: "Renovar",
    },
  });
  expect(renewal.statusCode, renewal.body).toBe(201);
  const approved = await app.inject({
    method: "POST",
    url: `/api/v1/renewals/${renewal.json().id}/approve`,
    headers: fixture.admin.headers,
    payload: {},
  });
  expect(approved.statusCode, approved.body).toBe(200);
  const renewed = await app.inject({
    url: `/api/v1/contracts/${approved.json().newContractId}`,
    headers: fixture.admin.headers,
  });
  expect(renewed.statusCode, renewed.body).toBe(200);
  expect(
    renewed.json().signatories.map((signer: { roleLabel: string }) => signer.roleLabel),
  ).toEqual([labels[1], labels[2], labels[0], "Testigo"]);
  expect(
    renewed.json().signatories.map((signer: { slotIndex: number | null }) => signer.slotIndex),
  ).toEqual([1, 2, 0, null]);
  expect(renewed.json().variablesData).toEqual(child.json().variablesData);
});
