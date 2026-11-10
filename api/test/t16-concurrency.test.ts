import { barrier } from "./t16-barrier.js";
import { beforeAll, beforeEach, afterEach, afterAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prepareDatabase, cleanDatabase, db, pool } from "./helpers.js";
import { testApp, loginUser, contractFixture, validPng, imageMultipart } from "./t09b-helpers.js";
import {
  contractSignatories,
  contractRenewals,
  contracts,
  signatureEvidence,
  files,
} from "../src/db/schema.js";
import * as service from "../src/modules/contracts/service.js";
import * as pdf from "../src/modules/contracts/pdf.js";
import * as locks from "../src/modules/contracts/contract-locks.js";

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

it("una segunda generación de renovación reserva ancestros antes de la firma y de la bandeja", async () => {
  const actor = await loginUser(app, { role: "admin" });
  const familyPrefix = randomUUID().slice(0, 24);
  const grandparent = await contractFixture(actor.user.id, {
    id: familyPrefix + "000000000061",
    status: "active",
  });
  const parent = await contractFixture(actor.user.id, {
    id: familyPrefix + "000000000062",
    status: "active",
    parentContractId: grandparent.id,
    renewalType: "manual_renewal",
  });
  const child = await contractFixture(actor.user.id, {
    id: familyPrefix + "000000000063",
    parentContractId: parent.id,
    renewalType: "manual_renewal",
  });
  await db.insert(contractRenewals).values({
    originalContractId: parent.id,
    newContractId: child.id,
    requestedBy: actor.user.id,
    status: "approved",
  });
  await db.insert(contractSignatories).values([
    ...[grandparent, parent].map((contract) => ({
      contractId: contract.id,
      name: actor.user.name,
      email: actor.user.email,
      role: "client" as const,
      status: "signed" as const,
      signedAt: new Date("2026-11-01T12:00:00Z"),
    })),
    {
      contractId: child.id,
      userId: actor.user.id,
      name: actor.user.name,
      email: actor.user.email,
      role: "client",
    },
  ]);
  const locked = barrier();
  const inboxStarted = barrier();
  const resume = barrier();
  const original = locks.lockContractRows;
  let calls = 0;
  vi.spyOn(locks, "lockContractRows").mockImplementation(async (tx, ids) => {
    const call = ++calls;
    if (call === 2) inboxStarted.resolve();
    const rows = await original(tx, ids);
    if (call === 1) {
      locked.resolve();
      await resume.promise;
    }
    return rows;
  });
  const signing = app
    .inject({
      method: "POST",
      url: `/api/v1/contracts/${child.id}/sign`,
      headers: { ...actor.headers, "content-type": "multipart/form-data; boundary=t09b" },
      payload: imageMultipart(validPng(), {
        acceptedDeclaration: "true",
        viewedAt: child.updatedAt.toISOString(),
      }),
    })
    .then((response) => response);
  await locked.promise;
  const inbox = app
    .inject({ url: "/api/v1/me/signatures?status=signed", headers: actor.headers })
    .then((response) => response);
  await inboxStarted.promise;
  resume.resolve();
  const responses = await Promise.all([signing, inbox]);
  expect(responses[0]!.statusCode, responses[0]!.body).toBe(200);
  expect(responses[1]!.statusCode, responses[1]!.body).toBe(200);
  expect((await db.select().from(contracts).where(eq(contracts.id, parent.id)))[0]!.status).toBe(
    "renewed",
  );
  expect(
    (await db.select().from(contracts).where(eq(contracts.id, grandparent.id)))[0]!.status,
  ).toBe("active");
});

it("la bandeja vincula invitados históricos sin invertir bloqueos frente a una acción", async () => {
  const actor = await loginUser(app, { role: "admin" });
  const contract = await contractFixture(actor.user.id);
  await db.insert(contractSignatories).values({
    contractId: contract.id,
    name: actor.user.name,
    email: actor.user.email,
    role: "client",
    status: "signed",
    signedAt: new Date("2026-11-01T12:00:00Z"),
  });
  const locked = barrier();
  const inboxStarted = barrier();
  const resume = barrier();
  const original = locks.lockContractRows;
  let calls = 0;
  vi.spyOn(locks, "lockContractRows").mockImplementation(async (tx, ids) => {
    const call = ++calls;
    if (call === 2) inboxStarted.resolve();
    const rows = await original(tx, ids);
    if (call === 1) {
      locked.resolve();
      await resume.promise;
    }
    return rows;
  });
  const action = app
    .inject({
      method: "POST",
      url: `/api/v1/contracts/${contract.id}/archive`,
      headers: actor.headers,
    })
    .then((response) => response);
  await locked.promise;
  const inbox = app
    .inject({ url: "/api/v1/me/signatures?status=signed", headers: actor.headers })
    .then((response) => response);
  await inboxStarted.promise;
  resume.resolve();
  const responses = await Promise.all([action, inbox]);
  expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
  expect((await db.select().from(contractSignatories))[0]!.userId).toBe(actor.user.id);
});

it.each(["sign", "archive"])(
  "%s y una renovación concurrente respetan contrato → usuario → firmantes",
  async (action) => {
    const actor = await loginUser(app, { role: "admin" });
    const contract = await contractFixture(actor.user.id);
    await db.insert(contractSignatories).values([
      { contractId: contract.id, name: actor.user.name, email: actor.user.email, role: "client" },
      { contractId: contract.id, name: "Pendiente", email: "pending@example.com", role: "client" },
    ]);
    const locked = barrier();
    const renewalReachedContract = barrier();
    const resume = barrier();
    const original = service.getContract;
    let calls = 0;
    vi.spyOn(service, "getContract").mockImplementation(async (tx, id, lock) => {
      if (lock && id === contract.id) {
        calls++;
        if (calls === 2) renewalReachedContract.resolve();
        const result = await original(tx, id, lock);
        if (calls === 1) {
          locked.resolve();
          await resume.promise;
        }
        return result;
      }
      return original(tx, id, lock);
    });
    const mutate =
      action === "archive"
        ? app
            .inject({
              method: "POST",
              url: `/api/v1/contracts/${contract.id}/archive`,
              headers: actor.headers,
            })
            .then((response) => response)
        : app
            .inject({
              method: "POST",
              url: `/api/v1/contracts/${contract.id}/sign`,
              headers: { ...actor.headers, "content-type": "multipart/form-data; boundary=t09b" },
              payload: imageMultipart(validPng(), {
                acceptedDeclaration: "true",
                viewedAt: contract.updatedAt.toISOString(),
              }),
            })
            .then((response) => response);
    await locked.promise;
    const renewal = app
      .inject({
        method: "POST",
        url: "/api/v1/renewals",
        headers: actor.headers,
        payload: {
          contractId: contract.id,
          proposedStartDate: "2027-11-01",
          proposedEndDate: "2028-11-01",
          proposedValue: "100.00",
          reason: "Renovar",
        },
      })
      .then((response) => response);
    await renewalReachedContract.promise;
    resume.resolve();
    const [mutated, requested] = await Promise.all([mutate, renewal]);
    expect(mutated.statusCode, mutated.body).toBe(200);
    expect(requested.statusCode, requested.body).toBe(409);
  },
);

it("dos últimas firmas concurrentes publican un único final y no duplican evidencia al reintentar", async () => {
  const actor = await loginUser(app, { role: "admin" });
  const second = await loginUser(app);
  const contract = await contractFixture(actor.user.id);
  await db.insert(contractSignatories).values(
    [actor, second].map((person) => ({
      contractId: contract.id,
      userId: person.user.id,
      name: person.user.name,
      email: person.user.email,
      role: "client" as const,
    })),
  );
  const finalPdf = vi.spyOn(pdf, "saveFinalPdf");
  const sign = (person: typeof actor) =>
    app.inject({
      method: "POST",
      url: `/api/v1/contracts/${contract.id}/sign`,
      headers: { ...person.headers, "content-type": "multipart/form-data; boundary=t09b" },
      payload: imageMultipart(validPng(), {
        acceptedDeclaration: "true",
        viewedAt: contract.updatedAt.toISOString(),
      }),
    });
  const responses = await Promise.all([sign(actor), sign(second)]);
  expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
  expect(finalPdf).toHaveBeenCalledOnce();
  expect(await db.select().from(signatureEvidence)).toHaveLength(2);
  expect((await sign(second)).statusCode).toBe(409);
  expect(finalPdf).toHaveBeenCalledOnce();
  expect((await db.select().from(contracts))[0]!.signedPdfSha256).toMatch(/^[a-f0-9]{64}$/);
});

it("un fallo al publicar el final revierte firma, evidencia y archivo de firma", async () => {
  const actor = await loginUser(app, { role: "admin" });
  const contract = await contractFixture(actor.user.id);
  await db.insert(contractSignatories).values({
    contractId: contract.id,
    userId: actor.user.id,
    name: actor.user.name,
    email: actor.user.email,
    role: "client",
  });
  vi.spyOn(pdf, "saveFinalPdf").mockRejectedValueOnce(new Error("Synthetic publication failure"));
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${contract.id}/sign`,
    headers: { ...actor.headers, "content-type": "multipart/form-data; boundary=t09b" },
    payload: imageMultipart(validPng(), {
      acceptedDeclaration: "true",
      viewedAt: contract.updatedAt.toISOString(),
    }),
  });
  expect(response.statusCode).toBe(500);
  expect(await db.select().from(signatureEvidence)).toHaveLength(0);
  expect(await db.select().from(files)).toHaveLength(0);
  expect(
    (
      await db
        .select()
        .from(contractSignatories)
        .where(eq(contractSignatories.contractId, contract.id))
    )[0]!.status,
  ).toBe("pending");
});
