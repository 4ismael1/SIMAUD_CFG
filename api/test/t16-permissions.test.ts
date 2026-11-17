import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { prepareDatabase, cleanDatabase, db, pool, authorization, signIn } from "./helpers.js";
import { testApp, loginUser, contractFixture } from "./t09b-helpers.js";
import {
  contracts,
  contractApprovals,
  contractRenewals,
  contractAuditLogs,
  users,
} from "../src/db/schema.js";
import { snapshot } from "../src/modules/contracts/service.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
});
afterEach(() => app.close());
afterAll(() => pool.end());

it("audita la solicitud vigente del admin aunque haya otra revisión de la misma versión", async () => {
  const admin = await loginUser(app, { role: "admin" });
  const manager = await loginUser(app, { role: "gestor" });
  const contract = await contractFixture(manager.user.id, { status: "pending_approval" });
  await db.insert(contractApprovals).values([
    { contractId: contract.id, versionNumber: 1, requestedBy: manager.user.id, status: "rejected" },
    { contractId: contract.id, versionNumber: 1, requestedBy: admin.user.id },
  ]);
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/v1/contracts/${contract.id}/approve`,
        headers: admin.headers,
      })
    ).statusCode,
  ).toBe(200);
  expect((await db.select().from(contractAuditLogs))[0]!.action).toBe("approved_own");
});

it("el admin autoaprueba su contrato y su renovación con acciones distinguibles", async () => {
  const admin = await loginUser(app, { role: "admin" });
  const contract = await contractFixture(admin.user.id, { status: "pending_approval" });
  await db.transaction((tx) => snapshot(tx, contract, admin.user, "Creación", []));
  await db
    .insert(contractApprovals)
    .values({ contractId: contract.id, versionNumber: 1, requestedBy: admin.user.id });
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${contract.id}/approve`,
    headers: admin.headers,
  });
  expect(response.statusCode, response.body).toBe(200);
  expect(response.json().can.approve).toBe(false);
  await db.update(contracts).set({ status: "active" }).where(eq(contracts.id, contract.id));
  const [renewal] = await db
    .insert(contractRenewals)
    .values({
      originalContractId: contract.id,
      requestedBy: admin.user.id,
      proposedStartDate: "2027-11-01",
      proposedEndDate: "2028-11-01",
      proposedValue: "100.00",
    })
    .returning();
  const approved = await app.inject({
    method: "POST",
    url: `/api/v1/renewals/${renewal!.id}/approve`,
    headers: admin.headers,
  });
  expect(approved.statusCode, approved.body).toBe(200);
  expect(approved.json()).not.toHaveProperty("originalRequestedBy");
  const actions = (await db.select().from(contractAuditLogs)).map((entry) => entry.action);
  expect(actions).toContain("approved_own");
  expect(actions).toContain("renewal-approved_own");
});

// Supervisors may approve their own (see contracts.test); a gestor never reviews.
it.each(["gestor"] as const)(
  "%s no aprueba ni devuelve su contrato o solicitud de renovación",
  async (role) => {
    const actor = await loginUser(app, { role });
    const contract = await contractFixture(actor.user.id, { status: "pending_approval" });
    await db
      .insert(contractApprovals)
      .values({ contractId: contract.id, versionNumber: 1, requestedBy: actor.user.id });
    const detail = await app.inject({
      url: `/api/v1/contracts/${contract.id}`,
      headers: actor.headers,
    });
    expect(detail.json().can).toMatchObject({ approve: false, reject: false });
    for (const action of ["approve", "reject"]) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/contracts/${contract.id}/${action}`,
        payload: { comment: "Revisión" },
        headers: actor.headers,
      });
      expect(response.statusCode, response.body).toBe(403);
    }
    await db.update(contracts).set({ status: "active" }).where(eq(contracts.id, contract.id));
    const [renewal] = await db
      .insert(contractRenewals)
      .values({ originalContractId: contract.id, requestedBy: actor.user.id })
      .returning();
    for (const action of ["approve", "reject"]) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/renewals/${renewal!.id}/${action}`,
        payload: { response: "Revisión" },
        headers: actor.headers,
      });
      expect(response.statusCode, response.body).toBe(403);
    }
    expect((await db.select().from(contractRenewals))[0]!.status).toBe("pending");
  },
);

it("reasignar no convierte al autor ni al solicitante (gestores) en revisores", async () => {
  const author = await loginUser(app, { role: "gestor" });
  const manager = await loginUser(app, { role: "gestor" });
  const contract = await contractFixture(author.user.id, { status: "pending_approval" });
  await db
    .insert(contractApprovals)
    .values({ contractId: contract.id, versionNumber: 1, requestedBy: manager.user.id });
  const [renewal] = await db
    .insert(contractRenewals)
    .values({ originalContractId: contract.id, requestedBy: manager.user.id })
    .returning();
  await db
    .update(contracts)
    .set({ createdBy: manager.user.id })
    .where(eq(contracts.id, contract.id));
  for (const actor of [author, manager]) {
    const response = await app.inject({
      url: `/api/v1/contracts/${contract.id}`,
      headers: actor.headers,
    });
    // The former author no longer even sees it; the new manager sees it but cannot review it.
    if (actor === author) expect(response.statusCode).toBe(404);
    else expect(response.json().can).toMatchObject({ approve: false, reject: false });
    for (const action of ["approve", "reject"])
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/contracts/${contract.id}/${action}`,
            headers: actor.headers,
            payload: { comment: "Revisión" },
          })
        ).statusCode,
      ).toBe(actor === author ? 404 : 403);
  }
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/v1/renewals/${renewal!.id}/approve`,
        headers: manager.headers,
      })
    ).statusCode,
  ).toBe(403);
  await expect(
    db
      .update(contracts)
      .set({ originalCreatedBy: manager.user.id })
      .where(eq(contracts.id, contract.id)),
  ).rejects.toThrow();
});
