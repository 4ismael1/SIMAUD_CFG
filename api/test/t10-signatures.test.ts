import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { readFile, writeFile } from "node:fs/promises";
import { cleanDatabase, db, pool, prepareDatabase } from "./helpers.js";
import { contractFixture, imageMultipart, loginUser, testApp, validPng } from "./t09b-helpers.js";
import {
  contracts,
  contractSignatories,
  signatureEvidence,
  contractAuditLogs,
  contractVersions,
  files,
} from "../src/db/schema.js";
import { canonicalJson, documentHash, sha256 } from "../src/lib/crypto/canonical.js";
import { verifyAuditChain } from "../src/lib/crypto/audit-chain.js";
import { verifyEvidenceChain, signingDeclaration } from "../src/modules/contracts/evidence.js";
import { verifySystemSeal } from "../src/lib/crypto/system-signing.js";
import { saveFinalPdf } from "../src/modules/contracts/pdf.js";
import { storage } from "../src/lib/storage.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
});
afterEach(() => app.close());
afterAll(() => pool.end());

async function signingFixture() {
  const first = await loginUser(app, { role: "admin", name: "Ana Pérez" });
  const second = await loginUser(app, { name: "Luis Gómez" });
  const contract = await contractFixture(first.user.id);
  await db.insert(contractSignatories).values(
    [first, second].map((actor, index) => ({
      contractId: contract.id,
      userId: actor.user.id,
      name: actor.user.name,
      email: actor.user.email,
      cedula: actor.user.cedula,
      role: "client" as const,
      signingOrder: index + 1,
    })),
  );
  const sign = async (actor: typeof first, fields: Record<string, string> = {}) => {
    const [current] = await db.select().from(contracts).where(eq(contracts.id, contract.id));
    return app.inject({
      method: "POST",
      url: `/api/v1/contracts/${contract.id}/sign`,
      headers: {
        ...actor.headers,
        "content-type": "multipart/form-data; boundary=t09b",
        "user-agent": "SIMAUD test",
      },
      payload: imageMultipart(validPng(), {
        acceptedDeclaration: "true",
        viewedAt: current!.updatedAt.toISOString(),
        ...fields,
      }),
    });
  };
  return { first, second, contract, sign };
}

it("canonicaliza saltos Windows y espacios finales sin alterar el texto significativo", () => {
  expect(documentHash("Hola &amp; tú  \r\nMundo\t\r")).toBe(documentHash("Hola & tú\nMundo\n"));
  expect(documentHash(" Hola")).not.toBe(documentHash("Hola"));
  expect(canonicalJson({ z: [1, { b: 2, a: 1 }], a: true })).toBe(
    '{"a":true,"z":[1,{"a":1,"b":2}]}',
  );
});

it("encadena firmas, conserva PNG saneado cifrado y publica solo evidencia mínima verificable", async () => {
  const { first, second, contract, sign } = await signingFixture();
  expect((await sign(first, { method: "typed", fontId: "allura" })).statusCode).toBe(200);
  const [partial] = await db.select().from(contracts).where(eq(contracts.id, contract.id));
  expect(partial!.updatedAt).toEqual(contract.updatedAt);
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: `/api/v1/contracts/${contract.id}`,
        headers: first.headers,
      })
    ).statusCode,
  ).toBe(409);
  expect((await sign(second, { method: "drawn" })).statusCode).toBe(200);
  const [sealed] = await db.select().from(contracts).where(eq(contracts.id, contract.id));
  expect(sealed!.status).toBe("active");
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: `/api/v1/contracts/${contract.id}`,
        headers: first.headers,
      })
    ).statusCode,
  ).toBe(409);
  const evidence = await db.select().from(signatureEvidence).orderBy(signatureEvidence.sequence);
  expect(evidence[0]!.payload).toMatchObject({
    method: "typed",
    fontId: "allura",
    declaration: signingDeclaration,
    contractVersion: 1,
    authenticationMethod: "password-session",
    signatureImageSha256: sha256(validPng()),
  });
  expect(evidence[0]!.payload.sessionId).toMatch(/^[a-f0-9-]{36}$/);
  expect(evidence[1]!.previousEvidenceHash).toBe(evidence[0]!.evidenceHash);
  expect(await verifyEvidenceChain(contract.id)).toBe(true);
  expect(await verifyAuditChain(contract.id)).toBe(true);
  expect(verifySystemSeal(sealed!.systemSeal)).toBe(true);
  const raw = await readFile("storage/signatures/" + evidence[0]!.payload.signaturePath);
  expect(raw.subarray(0, 8)).not.toEqual(validPng().subarray(0, 8));
  const [file] = await db
    .select()
    .from(files)
    .where(eq(files.path, evidence[0]!.payload.signaturePath));
  const image = await app.inject({
    url: "/api/v1/files/signatures/" + file!.id,
    headers: first.headers,
  });
  expect(image.rawPayload).toEqual(validPng());
  const verified = await app.inject({ url: "/api/v1/verify/" + sealed!.verificationCode });
  expect(verified.json()).toMatchObject({
    status: "registered",
    signatoryCount: 2,
    auditChainValid: true,
    evidenceChainValid: true,
    systemSignatureValid: true,
    pdfIntegrityValid: true,
  });
  for (const privateValue of [
    first.user.name,
    first.user.email,
    first.user.cedula,
    "127.0.0.1",
    "SIMAUD test",
    signingDeclaration,
  ])
    expect(verified.body).not.toContain(privateValue);
  const pdf = await storage.get("contracts/" + sealed!.signedPdfPath);
  const upload = (bytes: Buffer) =>
    app.inject({
      method: "POST",
      url: "/api/v1/verify/file",
      headers: { "content-type": "multipart/form-data; boundary=t09b" },
      payload: imageMultipart(bytes, {}, "file", "application/pdf"),
    });
  expect((await upload(pdf)).json()).toMatchObject({
    matches: true,
    code: sealed!.verificationCode,
    systemSignatureValid: true,
    status: "registered",
  });
  const modified = Buffer.from(pdf);
  modified[modified.length - 1] = modified[modified.length - 1]! ^ 1;
  expect((await upload(modified)).json()).toMatchObject({
    matches: false,
    systemSignatureValid: false,
  });
  const pdfPath = "storage/contracts/" + sealed!.signedPdfPath;
  try {
    await writeFile(pdfPath, modified);
    const corrupted = await app.inject({ url: "/api/v1/verify/" + sealed!.verificationCode });
    expect(corrupted.json()).toMatchObject({ status: "integrity_error", pdfIntegrityValid: false });
    expect(
      (
        await app.inject({
          url: `/api/v1/contracts/${contract.id}/pdf?final=true`,
          headers: first.headers,
        })
      ).statusCode,
    ).toBe(409);
    await expect(db.transaction((tx) => saveFinalPdf(tx, sealed!))).rejects.toThrow("integridad");
  } finally {
    await writeFile(pdfPath, pdf);
  }
  await db.transaction((tx) => saveFinalPdf(tx, sealed!));
  expect(await storage.get("contracts/" + sealed!.signedPdfPath)).toEqual(pdf);
  expect(
    verifySystemSeal({ ...sealed!.systemSeal!, signature: Buffer.alloc(64).toString("base64") }),
  ).toBe(false);
  const cancel = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${contract.id}/cancel`,
    headers: first.headers,
    payload: { reason: "other", description: "Motivo privado" },
  });
  expect(cancel.statusCode, cancel.body).toBe(200);
  const revoked = await app.inject({ url: "/api/v1/verify/" + sealed!.verificationCode });
  expect(revoked.json()).toMatchObject({ status: "cancelled", revokedAt: expect.any(String) });
  expect(revoked.body).not.toContain("Motivo privado");
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: `/api/v1/contracts/${contract.id}`,
        headers: first.headers,
      })
    ).statusCode,
  ).toBe(409);
});

it("detecta alteración y truncado de auditoría y alteración de evidencia", async () => {
  const { first, second, contract, sign } = await signingFixture();
  await sign(first);
  await sign(second);
  const logs = await db
    .select()
    .from(contractAuditLogs)
    .where(eq(contractAuditLogs.contractId, contract.id))
    .orderBy(contractAuditLogs.sequence);
  await db
    .update(contractAuditLogs)
    .set({ contractId: null })
    .where(eq(contractAuditLogs.id, logs[0]!.id));
  expect(await verifyAuditChain(contract.id)).toBe(false);
  await db
    .update(contractAuditLogs)
    .set({ contractId: contract.id })
    .where(eq(contractAuditLogs.id, logs[0]!.id));
  await db
    .update(contractAuditLogs)
    .set({ action: "alterado" })
    .where(eq(contractAuditLogs.id, logs[0]!.id));
  expect(await verifyAuditChain(contract.id)).toBe(false);
  await db
    .update(contractAuditLogs)
    .set({ action: logs[0]!.action })
    .where(eq(contractAuditLogs.id, logs[0]!.id));
  expect(await verifyAuditChain(contract.id)).toBe(true);
  await db.delete(contractAuditLogs).where(eq(contractAuditLogs.id, logs.at(-1)!.id));
  expect(await verifyAuditChain(contract.id)).toBe(false);
  const [row] = await db.select().from(signatureEvidence);
  await db
    .update(signatureEvidence)
    .set({ payload: { ...row!.payload, method: "uploaded" } })
    .where(eq(signatureEvidence.id, row!.id));
  expect(await verifyEvidenceChain(contract.id)).toBe(false);
});

it("conserva evidencia y archivo de la versión firmada cuando se edita un contrato devuelto", async () => {
  const { first, second, contract, sign } = await signingFixture();
  await db.insert(contractVersions).values({
    contractId: contract.id,
    versionNumber: 1,
    content: contract.content,
    generatedContent: contract.generatedContent,
  });
  await sign(first);
  const decline = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${contract.id}/decline`,
    headers: second.headers,
    payload: { reason: "Revisar texto" },
  });
  expect(decline.statusCode, decline.body).toBe(200);
  const edit = await app.inject({
    method: "PATCH",
    url: `/api/v1/contracts/${contract.id}`,
    headers: first.headers,
    payload: {
      content: "Documento nuevo",
      signatories: [
        {
          name: second.user.name,
          email: second.user.email,
          cedula: second.user.cedula,
          role: "client",
          signingOrder: 1,
        },
      ],
    },
  });
  expect(edit.statusCode, edit.body).toBe(200);
  expect(edit.json().currentVersion).toBe(2);
  expect(edit.json().signatories).toHaveLength(1);
  const [evidence] = await db.select().from(signatureEvidence);
  expect(evidence!.contractVersion).toBe(1);
  expect(evidence!.payload.documentSha256).toBe(documentHash("Documento"));
  expect(await storage.get("signatures/" + evidence!.payload.signaturePath)).toEqual(validPng());
  expect(await verifyEvidenceChain(contract.id)).toBe(true);
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: `/api/v1/contracts/${contract.id}`,
        headers: first.headers,
      })
    ).statusCode,
  ).toBe(409);
});

it("admin solo elimina draft y rejected sin firmas y la auditoría sobrevive sin confirm", async () => {
  const { first, contract } = await signingFixture();
  for (const status of ["active", "pending_signatures", "cancelled"] as const) {
    await db.update(contracts).set({ status }).where(eq(contracts.id, contract.id));
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/contracts/${contract.id}`,
          headers: first.headers,
        })
      ).statusCode,
    ).toBe(409);
    const detail = await app.inject({
      url: `/api/v1/contracts/${contract.id}`,
      headers: first.headers,
    });
    expect(detail.json().can.delete).toBe(false);
  }
  for (const status of ["draft", "rejected"] as const) {
    const draft = await contractFixture(first.user.id, { status });
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/contracts/${draft.id}`,
          headers: first.headers,
        })
      ).statusCode,
    ).toBe(200);
    const [log] = await db
      .select()
      .from(contractAuditLogs)
      .where(eq(contractAuditLogs.chainContractId, draft.id));
    expect(log).toMatchObject({
      action: "delete",
      contractId: null,
      entryHash: expect.any(String),
    });
    const intact = await db.execute<{ valid: boolean }>(
      sql`select entry_hash=t10_audit_hash(to_jsonb(l)) valid from contract_audit_logs l where id=${log!.id}`,
    );
    expect(intact.rows[0]!.valid).toBe(true);
  }
  const legacy = await contractFixture(first.user.id, { status: "rejected" });
  const [oldSigner] = await db
    .insert(contractSignatories)
    .values({
      contractId: legacy.id,
      name: first.user.name,
      email: first.user.email,
      role: "client",
      status: "signed",
      signedAt: new Date(),
    })
    .returning();
  await db
    .update(contractSignatories)
    .set({ status: "pending", signedAt: null })
    .where(eq(contractSignatories.id, oldSigner!.id));
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: `/api/v1/contracts/${legacy.id}`,
        headers: first.headers,
      })
    ).statusCode,
  ).toBe(409);
});

it("rechaza PDF falso y excesivo, no encontrado y limita verificación por IP", async () => {
  const upload = (bytes: Buffer, mime = "application/pdf") =>
    app.inject({
      method: "POST",
      url: "/api/v1/verify/file",
      headers: { "content-type": "multipart/form-data; boundary=t09b" },
      payload: imageMultipart(bytes, {}, "file", mime),
      remoteAddress: "192.0.2.2",
    });
  expect((await upload(validPng())).statusCode).toBe(400);
  expect((await upload(Buffer.from("%PDF-1.7"), "image/png")).statusCode).toBe(400);
  expect((await upload(Buffer.alloc(15 * 1024 * 1024 + 1))).statusCode).toBe(413);
  for (let index = 0; index < 10; index++)
    expect(
      (await app.inject({ url: "/api/v1/verify/SIM-AAAA-BBBB-CCCC-DDDD-EEEE" })).json(),
    ).toEqual({ status: "not_found" });
  expect(
    (await app.inject({ url: "/api/v1/verify/SIM-AAAA-BBBB-CCCC-DDDD-EEEE" })).statusCode,
  ).toBe(429);
  expect(
    (
      await app.inject({
        url: "/api/v1/verify/SIM-AAAA-BBBB-CCCC-DDDD-EEEE",
        remoteAddress: "192.0.2.10",
      })
    ).statusCode,
  ).toBe(200);
});
