import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { cleanDatabase, db, pool, prepareDatabase, signIn, authorization } from "./helpers.js";
import { testApp, loginUser } from "./t09b-helpers.js";
import { signingFixture } from "./t18-helpers.js";
import { barrier } from "./t16-barrier.js";
import {
  contracts,
  contractSignatories,
  signatureEvidence,
  contractApprovals,
  users,
  notifications,
} from "../src/db/schema.js";
import { verifyEvidenceChain } from "../src/modules/contracts/evidence.js";
import { publicVerification } from "../src/modules/verify/service.js";
import { storage } from "../src/lib/storage.js";
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

async function signers(id: string) {
  return db
    .select()
    .from(contractSignatories)
    .where(eq(contractSignatories.contractId, id))
    .orderBy(contractSignatories.signingOrder);
}
function reset(
  id: string,
  headers: { authorization: string },
  signatoryId?: string,
  payload: Record<string, unknown> = { reason: "Volver a firmar" },
) {
  const suffix = signatoryId ? `${signatoryId}/reset` : "reset";
  return app.inject({
    method: "POST",
    url: `/api/v1/contracts/${id}/signatures/${suffix}`,
    headers,
    payload,
  });
}

it("anula una firma intermedia, conserva las posteriores y vuelve al primer pendiente con evidencia verificable", async () => {
  const fixture = await signingFixture(app, 4);
  for (const index of [0, 1, 2]) expect((await fixture.sign(index)).statusCode).toBe(200);
  const before = await signers(fixture.contract.id);
  const historical = await db.select().from(signatureEvidence).orderBy(signatureEvidence.sequence);
  const response = await reset(fixture.contract.id, fixture.admin.headers, before[1]!.id);
  expect(response.statusCode, response.body).toBe(200);
  const after = await signers(fixture.contract.id);
  expect(after[2]).toEqual(before[2]);
  expect(after[0]).toEqual(before[0]);
  expect(after[1]).toMatchObject({
    status: "pending",
    signaturePath: null,
    signedAt: null,
    placement: null,
  });
  const evidence = await db.select().from(signatureEvidence).orderBy(signatureEvidence.sequence);
  expect(evidence.slice(0, 3)).toEqual(historical);
  expect(evidence[3]!.payload).toMatchObject({
    format: "simaud-evidence-v2",
    event: "superseded",
    supersedesEvidenceHash: historical[1]!.evidenceHash,
    reason: "Volver a firmar",
    eventUserId: fixture.admin.user.id,
  });
  expect(await storage.get("signatures/" + before[1]!.signaturePath)).toBeInstanceOf(Buffer);
  expect(await verifyEvidenceChain(fixture.contract.id)).toBe(true);
  expect((await fixture.sign(3)).statusCode).toBe(409);
  expect((await reset(fixture.contract.id, fixture.admin.headers, before[1]!.id)).statusCode).toBe(
    409,
  );
  expect((await fixture.sign(1)).statusCode).toBe(200);
  expect(await verifyEvidenceChain(fixture.contract.id)).toBe(true);
  expect((await fixture.sign(3)).statusCode).toBe(200);
  const current = await fixture.current();
  expect(await publicVerification(current.verificationCode!)).toMatchObject({
    status: "registered",
    evidenceChainValid: true,
  });
  expect((await reset(fixture.contract.id, fixture.admin.headers, before[0]!.id)).statusCode).toBe(
    409,
  );
});

it("reinicia todas en orden sin reabrir aprobación, notifica y publica capacidades coherentes", async () => {
  const fixture = await signingFixture(app);
  await fixture.sign(0);
  await fixture.sign(1);
  const approvals = await db.select().from(contractApprovals);
  const before = await signers(fixture.contract.id);
  const detail = await app.inject({
    url: `/api/v1/contracts/${fixture.contract.id}`,
    headers: fixture.admin.headers,
  });
  expect(detail.json().can).toMatchObject({ resetSignature: true, resetSignatures: true });
  expect(
    detail
      .json()
      .signatories.map((signer: { canResetSignature: boolean }) => signer.canResetSignature),
  ).toEqual([true, true, false]);
  const response = await reset(fixture.contract.id, fixture.admin.headers);
  expect(response.statusCode, response.body).toBe(200);
  expect((await signers(fixture.contract.id)).every((signer) => signer.status === "pending")).toBe(
    true,
  );
  const notices = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, fixture.actors[0]!.user.id));
  expect(notices.filter((notice) => notice.type === "signature_required")).toHaveLength(1);
  expect(await db.select().from(contractApprovals)).toEqual(approvals);
  expect((await fixture.current()).status).toBe("pending_signatures");
  expect((await fixture.current()).updatedAt).toEqual(fixture.contract.updatedAt);
  expect(await verifyEvidenceChain(fixture.contract.id)).toBe(true);
  expect((await reset(fixture.contract.id, fixture.admin.headers)).statusCode).toBe(409);
  expect((await fixture.sign(1)).statusCode).toBe(409);
  for (const index of [0, 1, 2]) expect((await fixture.sign(index)).statusCode).toBe(200);
  expect(await verifyEvidenceChain(fixture.contract.id)).toBe(true);
  for (const signer of before.filter((item) => item.signaturePath))
    expect(await storage.get("signatures/" + signer.signaturePath)).toBeInstanceOf(Buffer);
});

it("admin y gestor dueño pueden anular firmas ajenas; supervisor, participante y ajeno no", async () => {
  const fixture = await signingFixture(app);
  await fixture.sign(0);
  const [target] = await signers(fixture.contract.id);
  const supervisor = await loginUser(app, { role: "supervisor" });
  const gestor = await loginUser(app, { role: "gestor" });
  const outsider = await loginUser(app, { role: "gestor" });
  for (const headers of [supervisor.headers, fixture.actors[0]!.headers])
    expect((await reset(fixture.contract.id, headers, target!.id)).statusCode).toBe(403);
  for (const id of [fixture.contract.id, randomUUID()])
    expect((await reset(id, outsider.headers, target!.id)).statusCode).toBe(404);
  expect((await reset(fixture.contract.id, fixture.admin.headers, randomUUID())).statusCode).toBe(
    404,
  );
  for (const payload of [
    {},
    { reason: " " },
    { reason: "x".repeat(501) },
    { reason: "Bien", signatoryId: target!.id },
  ])
    expect(
      (await reset(fixture.contract.id, fixture.admin.headers, target!.id, payload)).statusCode,
    ).toBe(400);
  await db
    .update(contracts)
    .set({ createdBy: gestor.user.id })
    .where(eq(contracts.id, fixture.contract.id));
  expect((await reset(fixture.contract.id, gestor.headers, target!.id)).statusCode).toBe(200);
  await fixture.sign(0);
  await db
    .update(contracts)
    .set({ createdBy: fixture.actors[0]!.user.id })
    .where(eq(contracts.id, fixture.contract.id));
  await db.update(users).set({ role: "admin" }).where(eq(users.id, fixture.actors[0]!.user.id));
  const ownHeaders = authorization((await signIn(app, fixture.actors[0]!.user)).token);
  expect((await reset(fixture.contract.id, ownHeaders, target!.id)).statusCode).toBe(403);
  expect((await reset(fixture.contract.id, ownHeaders)).statusCode).toBe(403);
});

it.each(["reset", "sign"])(
  "serializa anulación contra última firma cuando obtiene el bloqueo primero: %s",
  async (first) => {
    const fixture = await signingFixture(app, 2);
    await fixture.sign(0);
    const [target] = await signers(fixture.contract.id);
    const locked = barrier();
    const secondStarted = barrier();
    const resume = barrier();
    const original = locks.lockContractRows;
    let calls = 0;
    vi.spyOn(locks, "lockContractRows").mockImplementation(async (connection, ids) => {
      const call = ++calls;
      if (call === 2) secondStarted.resolve();
      const result = await original(connection, ids);
      if (call === 1) {
        locked.resolve();
        await resume.promise;
      }
      return result;
    });
    const firstRequest = (
      first === "reset"
        ? reset(fixture.contract.id, fixture.admin.headers, target!.id)
        : fixture.sign(1)
    ).then((response) => response);
    await locked.promise;
    const secondRequest = (
      first === "reset"
        ? fixture.sign(1)
        : reset(fixture.contract.id, fixture.admin.headers, target!.id)
    ).then((response) => response);
    await secondStarted.promise;
    resume.resolve();
    const responses = await Promise.all([firstRequest, secondRequest]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 409]);
    expect(await verifyEvidenceChain(fixture.contract.id)).toBe(true);
    expect((await fixture.current()).status).toBe(
      first === "reset" ? "pending_signatures" : "active",
    );
  },
);
