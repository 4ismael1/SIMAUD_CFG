import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { cleanDatabase, db, pool, prepareDatabase } from "./helpers.js";
import { testApp } from "./t09b-helpers.js";
import { signingFixture } from "./t18-helpers.js";
import {
  contracts,
  contractSignatories,
  signatureEvidence,
  contractAuditLogs,
} from "../src/db/schema.js";
import { canonicalJson, sha256 } from "../src/lib/crypto/canonical.js";
import * as evidence from "../src/modules/contracts/evidence.js";

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

it("conserva la cadena si un firmante declina después de anular su firma", async () => {
  const fixture = await signingFixture(app, 2);
  await fixture.sign(0);
  const reset = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${fixture.contract.id}/signatures/reset`,
    headers: fixture.admin.headers,
    payload: { reason: "Firmar de nuevo" },
  });
  expect(reset.statusCode).toBe(200);
  const decline = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${fixture.contract.id}/decline`,
    headers: fixture.actors[0]!.headers,
    payload: { reason: "Solicitar corrección" },
  });
  expect(decline.statusCode).toBe(200);
  expect((await fixture.current()).status).toBe("rejected");
  expect(await evidence.verifyEvidenceChain(fixture.contract.id)).toBe(true);
});

it("anula evidencia v1 con un sucesor v2 sin colocación y enlaza la nueva firma sin modificar el pasado", async () => {
  const fixture = await signingFixture(app, 2);
  await fixture.sign(0);
  const [row] = await db.select().from(signatureEvidence);
  const {
    placement: _placement,
    event: _event,
    recordedAt: _recorded,
    supersedesEvidenceHash: _supersedes,
    ...original
  } = row!.payload;
  const legacy = { ...original, format: "simaud-evidence-v1" as const };
  const hash = sha256(canonicalJson(legacy));
  await db
    .update(signatureEvidence)
    .set({ payload: legacy, evidenceHash: hash })
    .where(eq(signatureEvidence.id, row!.id));
  await db
    .update(contracts)
    .set({ evidenceHead: hash })
    .where(eq(contracts.id, fixture.contract.id));
  await db
    .update(contractSignatories)
    .set({ placement: null })
    .where(eq(contractSignatories.id, row!.signatoryId));
  expect(await evidence.verifyEvidenceChain(fixture.contract.id)).toBe(true);
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${fixture.contract.id}/signatures/${row!.signatoryId}/reset`,
    headers: fixture.admin.headers,
    payload: { reason: "Nueva firma" },
  });
  expect(response.statusCode, response.body).toBe(200);
  expect(await evidence.verifyEvidenceChain(fixture.contract.id)).toBe(true);
  expect((await fixture.sign(0)).statusCode).toBe(200);
  const rows = await db.select().from(signatureEvidence).orderBy(signatureEvidence.sequence);
  expect(rows[0]!.payload).toEqual(legacy);
  expect(rows[1]!.payload).toMatchObject({
    format: "simaud-evidence-v2",
    event: "superseded",
    supersedesEvidenceHash: hash,
  });
  expect(rows[2]!.payload).toMatchObject({
    event: "resigned",
    supersedesEvidenceHash: rows[1]!.evidenceHash,
  });
  expect(await evidence.verifyEvidenceChain(fixture.contract.id)).toBe(true);
  expect((await fixture.sign(1)).statusCode).toBe(200);
  expect(await evidence.verifyEvidenceChain(fixture.contract.id)).toBe(true);
});

it("revierte todas las anulaciones y la auditoría si falla la segunda evidencia", async () => {
  const fixture = await signingFixture(app, 3);
  await fixture.sign(0);
  await fixture.sign(1);
  const before = await db.select().from(contractSignatories).orderBy(contractSignatories.id);
  const history = await db.select().from(signatureEvidence).orderBy(signatureEvidence.sequence);
  const audit = await db.select().from(contractAuditLogs).orderBy(contractAuditLogs.id);
  const contract = await fixture.current();
  const original = evidence.recordEvidence;
  let calls = 0;
  vi.spyOn(evidence, "recordEvidence").mockImplementation(async (...args) => {
    if (++calls === 2) throw new Error("Fallo sintético de persistencia");
    return original(...args);
  });
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${fixture.contract.id}/signatures/reset`,
    headers: fixture.admin.headers,
    payload: { reason: "Nueva firma" },
  });
  expect(response.statusCode).toBe(500);
  expect(await db.select().from(contractSignatories).orderBy(contractSignatories.id)).toEqual(
    before,
  );
  expect(await db.select().from(signatureEvidence).orderBy(signatureEvidence.sequence)).toEqual(
    history,
  );
  expect(await db.select().from(contractAuditLogs).orderBy(contractAuditLogs.id)).toEqual(audit);
  expect(await fixture.current()).toEqual(contract);
  expect(await evidence.verifyEvidenceChain(fixture.contract.id)).toBe(true);
});
