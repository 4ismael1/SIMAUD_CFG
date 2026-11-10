import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { cleanDatabase, db, pool, prepareDatabase, signIn, authorization } from "./helpers.js";
import { testApp, loginUser } from "./t09b-helpers.js";
import { signingFixture, current, post, sign, approve, setApp } from "./t17-helpers.js";
import { contracts, contractAuditLogs, contractApprovals, users } from "../src/db/schema.js";
import { publicVerification, verifyPdfHash } from "../src/modules/verify/service.js";
import { verifyEvidenceChain } from "../src/modules/contracts/evidence.js";
import { verifyAuditChain } from "../src/lib/crypto/audit-chain.js";
import { storage } from "../src/lib/storage.js";
import { updateContractStatus } from "../src/jobs/update-contract-status.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
  setApp(app);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
});
afterAll(() => pool.end());

it("crea, edita, aprueba y activa la enmienda conservando PDF, sello, código y verificación del original", async () => {
  const fixture = await signingFixture(app, 2);
  const original = await fixture.seal();
  const bytes = await storage.get("contracts/" + original.signedPdfPath);
  const response = await post(original.id, "amendments", fixture.admin.headers, {
    reason: "Corregir cláusula",
  });
  expect(response.statusCode, response.body).toBe(201);
  const child = await current(response.json().id);
  expect(child).toMatchObject({
    code: original.code + "-E1",
    amendsContractId: original.id,
    amendmentNumber: 1,
    status: "draft",
    content: original.content,
    contentFormat: original.contentFormat,
    generatedContent: original.generatedContent,
    contractValue: original.contractValue,
    startDate: original.startDate,
    endDate: original.endDate,
    signedPdfPath: null,
    systemSeal: null,
    evidenceCount: 0,
  });
  expect((await current(original.id)).status).toBe("active");
  const edited = await app.inject({
    method: "PATCH",
    url: `/api/v1/contracts/${child.id}`,
    headers: fixture.admin.headers,
    payload: { content: "Documento corregido", endDate: "2028-11-01" },
  });
  expect(edited.statusCode, edited.body).toBe(200);
  await approve(child.id, fixture.admin.headers);
  expect((await sign(child.id, fixture.actors[1]!.headers)).statusCode).toBe(409);
  expect((await sign(child.id, fixture.actors[0]!.headers)).statusCode).toBe(200);
  expect((await current(original.id)).status).toBe("active");
  expect((await sign(child.id, fixture.actors[1]!.headers)).statusCode).toBe(200);
  const replaced = await current(original.id);
  expect(replaced).toMatchObject({
    status: "amended",
    amendedByContractId: child.id,
    signedPdfPath: original.signedPdfPath,
    signedPdfSha256: original.signedPdfSha256,
    documentSha256: original.documentSha256,
    systemSeal: original.systemSeal,
    verificationCode: original.verificationCode,
  });
  expect(await storage.get("contracts/" + original.signedPdfPath)).toEqual(bytes);
  const active = await current(child.id);
  expect(active.status).toBe("active");
  expect(await publicVerification(original.verificationCode!)).toMatchObject({
    status: "amended",
    evidenceChainValid: true,
    auditChainValid: true,
    systemSignatureValid: true,
    pdfIntegrityValid: true,
    amendedBy: { verificationCode: active.verificationCode, code: child.code, amendmentNumber: 1 },
  });
  expect(await verifyPdfHash(original.verificationCode!, original.signedPdfSha256!)).toEqual({
    match: true,
    status: "amended",
  });
  expect(await publicVerification(active.verificationCode!)).toMatchObject({
    status: "registered",
  });
  for (const id of [original.id, child.id]) {
    expect(await verifyEvidenceChain(id)).toBe(true);
    expect(await verifyAuditChain(id)).toBe(true);
    const logs = await db
      .select()
      .from(contractAuditLogs)
      .where(eq(contractAuditLogs.contractId, id));
    expect(logs.map((log) => log.action)).toEqual(
      expect.arrayContaining(["amendment_created", "amendment_activated"]),
    );
  }
  const eligible = await app.inject({
    url: "/api/v1/renewals/eligible",
    headers: fixture.admin.headers,
  });
  expect(eligible.json().map((row: { id: string }) => row.id)).toContain(child.id);
  expect(eligible.json().map((row: { id: string }) => row.id)).not.toContain(original.id);
  const detail = await app.inject({
    url: `/api/v1/contracts/${original.id}`,
    headers: fixture.admin.headers,
  });
  expect(detail.json().can.amend).toBe(false);
  expect(detail.json().amendmentChain.map((row: { id: string }) => row.id)).toEqual([
    original.id,
    child.id,
  ]);
  expect(Object.keys(detail.json().amendmentChain[1]).sort()).toEqual(
    [
      "amendedByContractId",
      "amendmentNumber",
      "amendmentRootId",
      "amendsContractId",
      "code",
      "id",
      "status",
    ].sort(),
  );
  const next = await post(child.id, "amendments", fixture.admin.headers, {
    reason: "Segunda corrección",
  });
  expect(next.statusCode, next.body).toBe(201);
  expect(next.json()).toMatchObject({
    code: original.code + "-E2",
    amendsContractId: child.id,
    amendmentNumber: 2,
  });
  await updateContractStatus("2028-11-02");
  expect((await current(original.id)).status).toBe("amended");
  expect((await current(child.id)).status).toBe("expired");
});

it("serializa dos enmiendas y permite cancelar sin tocar al original ni reutilizar números", async () => {
  const fixture = await signingFixture(app, 1);
  const original = await fixture.seal();
  const responses = await Promise.all(
    [1, 2].map(() =>
      post(original.id, "amendments", fixture.admin.headers, { reason: "Corrección" }),
    ),
  );
  expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
  const id = responses.find((response) => response.statusCode === 201)!.json().id as string;
  const cancelled = await post(id, "cancel", fixture.admin.headers, {
    reason: "other",
    description: "Ya no procede",
  });
  expect(cancelled.statusCode, cancelled.body).toBe(200);
  expect((await current(original.id)).status).toBe("active");
  expect(
    (
      await post(original.id, "amendments", fixture.admin.headers, { reason: "Nueva corrección" })
    ).json().code,
  ).toBe(original.code + "-E2");
});

it("aplica permisos, opacidad y validación estricta al crear enmiendas", async () => {
  const fixture = await signingFixture(app, 1);
  await fixture.seal();
  const supervisor = await loginUser(app, { role: "supervisor" });
  const gestor = await loginUser(app, { role: "gestor" });
  for (const headers of [supervisor.headers, fixture.actors[0]!.headers])
    expect(
      (await post(fixture.contract.id, "amendments", headers, { reason: "Corrección" })).statusCode,
    ).toBe(403);
  for (const id of [fixture.contract.id, randomUUID()])
    expect(
      (await post(id, "amendments", gestor.headers, { reason: "Corrección" })).statusCode,
    ).toBe(404);
  for (const payload of [
    {},
    { reason: " " },
    { reason: "x".repeat(501) },
    { reason: "Corrección", unknown: true },
  ])
    expect(
      (await post(fixture.contract.id, "amendments", fixture.admin.headers, payload)).statusCode,
    ).toBe(400);
  await db
    .update(contracts)
    .set({ createdBy: gestor.user.id })
    .where(eq(contracts.id, fixture.contract.id));
  const created = await post(fixture.contract.id, "amendments", gestor.headers, {
    reason: "Corrección",
  });
  expect(created.statusCode, created.body).toBe(201);
  const id = created.json().id as string;
  expect((await post(id, "submit", gestor.headers)).statusCode).toBe(200);
  await db.update(users).set({ role: "supervisor" }).where(eq(users.id, gestor.user.id));
  const reviewerHeaders = authorization((await signIn(app, gestor.user)).token);
  expect((await post(id, "approve", reviewerHeaders)).statusCode).toBe(403);
  expect((await post(id, "approve", fixture.admin.headers)).statusCode).toBe(200);
});

it("conserva indefinidamente la aprobación histórica después de declinar, editar e intentar borrar", async () => {
  const fixture = await signingFixture(app, 1);
  const declined = await post(fixture.contract.id, "decline", fixture.actors[0]!.headers, {
    reason: "Corregir texto",
  });
  expect(declined.statusCode).toBe(200);
  const remove = () =>
    app.inject({
      method: "DELETE",
      url: `/api/v1/contracts/${fixture.contract.id}`,
      headers: fixture.admin.headers,
    });
  expect((await remove()).statusCode).toBe(409);
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/v1/contracts/${fixture.contract.id}`,
        headers: fixture.admin.headers,
        payload: { content: "Nuevo texto" },
      })
    ).statusCode,
  ).toBe(200);
  await db
    .update(contracts)
    .set({ everApproved: false, approvedAt: null })
    .where(eq(contracts.id, fixture.contract.id));
  expect((await current(fixture.contract.id)).everApproved).toBe(true);
  expect((await remove()).statusCode).toBe(409);
  expect((await current(fixture.contract.id)).status).toBe("draft");
  const detail = await app.inject({
    url: `/api/v1/contracts/${fixture.contract.id}`,
    headers: fixture.admin.headers,
  });
  expect(detail.json().can.delete).toBe(false);
});

it("bloquea renovaciones mientras hay una enmienda abierta y activaciones administrativas sin firmas", async () => {
  const fixture = await signingFixture(app, 1);
  await fixture.seal();
  const created = await post(fixture.contract.id, "amendments", fixture.admin.headers, {
    reason: "Corrección",
  });
  const id = created.json().id as string;
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
  expect(renewal.statusCode, renewal.body).toBe(409);
  await approve(id, fixture.admin.headers);
  expect(
    (
      await post(id, "override-status", fixture.admin.headers, {
        status: "active",
        reason: "Activar",
      })
    ).statusCode,
  ).toBe(409);
  const approvals = await db
    .select()
    .from(contractApprovals)
    .where(eq(contractApprovals.contractId, id));
  expect(approvals).toHaveLength(1);
});
