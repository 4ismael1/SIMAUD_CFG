import { timingSafeEqual } from "node:crypto";
import type { PublicVerification } from "./types.js";
import { findVerificationCode, normalizeVerificationCode } from "./codes.js";
import { pdfPageCount, verificationCopy } from "./pdf-copy.js";
import { audit } from "../../lib/audit.js";
import { maskIp } from "../contracts/pdf-attestation.js";
import { ApiError } from "../../lib/errors.js";
import { matchesDocumentHash } from "../../lib/rich-doc/content.js";
import { and, eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { contracts, contractAuditLogs, verificationCodes } from "../../db/schema.js";
import { verifyAuditChain } from "../../lib/crypto/audit-chain.js";
import { verifySystemSeal } from "../../lib/crypto/system-signing.js";
import { sha256 } from "../../lib/crypto/canonical.js";
import { storage } from "../../lib/storage.js";
import {
  canRead,
  getContract,
  getSignatories,
  type Actor,
  type Contract,
} from "../contracts/service.js";
import { findIssuedCopy, recordIssuedCopy } from "./issued-copies.js";
import { verifyEvidenceChain } from "../contracts/evidence.js";

export function verifyContractSeal(contract: Contract) {
  const seal = contract.systemSeal;
  return (
    !!seal &&
    verifySystemSeal(seal) &&
    seal.payload.contractId === contract.id &&
    seal.payload.contractVersion === contract.currentVersion &&
    seal.payload.activatedAt === contract.activatedAt?.toISOString() &&
    seal.payload.documentSha256 === contract.documentSha256 &&
    matchesDocumentHash(
      contract.generatedContent ?? contract.content,
      contract.contentFormat,
      seal.payload.documentSha256,
    ) &&
    seal.payload.finalPdfSha256 === contract.signedPdfSha256 &&
    seal.payload.evidenceHead === contract.evidenceHead
  );
}

async function pdfIntegrity(contract: Contract) {
  if (!contract.signedPdfPath) return { valid: false, pageCount: null };
  try {
    const bytes = await storage.get("contracts/" + contract.signedPdfPath);
    const valid = sha256(bytes) === contract.signedPdfSha256;
    return { valid, pageCount: valid ? await pdfPageCount(bytes) : null };
  } catch {
    // Missing, corrupt or unreadable objects must never be reported as intact.
    return { valid: false, pageCount: null };
  }
}
const maskName = (name: string) =>
  name
    .trim()
    .split(/\s+/u)
    .map((part) => [...part][0] + "***")
    .join(" ");

export async function publicVerification(code: string): Promise<PublicVerification> {
  return db.transaction((tx) => verificationSnapshot(tx, code), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

async function verificationSnapshot(tx: Transaction, code: string): Promise<PublicVerification> {
  const registration = await findVerificationCode(code, tx);
  if (!registration) return { status: "not_found" as const };
  if (registration.revoked) return { status: "revoked" as const };
  const [contract] = await tx
    .select()
    .from(contracts)
    .where(eq(contracts.id, registration.contractId));
  if (!contract) return { status: "not_found" as const };
  const [auditChainValid, evidenceChainValid, pdf] = await Promise.all([
    verifyAuditChain(contract.id, tx),
    verifyEvidenceChain(contract.id, tx),
    pdfIntegrity(contract),
  ]);
  const [anchor] = contract.systemSeal?.payload.auditHead
    ? await tx
        .select({ id: contractAuditLogs.id })
        .from(contractAuditLogs)
        .where(
          and(
            eq(contractAuditLogs.chainContractId, contract.id),
            eq(contractAuditLogs.entryHash, contract.systemSeal.payload.auditHead),
          ),
        )
    : [];
  const sealedCode = contract.systemSeal?.payload.verificationCode;
  const [sealedRegistration] = sealedCode
    ? await tx
        .select()
        .from(verificationCodes)
        .where(
          and(
            eq(verificationCodes.code, normalizeVerificationCode(sealedCode) ?? ""),
            eq(verificationCodes.contractId, contract.id),
          ),
        )
    : [];
  const systemSignatureValid =
    verifyContractSeal(contract) &&
    !!anchor &&
    !!sealedRegistration &&
    normalizeVerificationCode(contract.verificationCode ?? "") === registration.code;
  const pdfIntegrityValid = pdf.valid;
  const valid = auditChainValid && evidenceChainValid && pdfIntegrityValid && systemSignatureValid;
  const signers = await getSignatories(tx, contract.id);
  const [successor] = contract.amendedByContractId
    ? await tx
        .select({
          verificationCode: contracts.verificationCode,
          title: contracts.title,
          code: contracts.code,
          amendmentNumber: contracts.amendmentNumber,
        })
        .from(contracts)
        .where(eq(contracts.id, contract.amendedByContractId))
    : [];
  const amendedBy = successor?.verificationCode
    ? { ...successor, verificationCode: successor.verificationCode }
    : undefined;
  return {
    status:
      contract.status === "cancelled"
        ? ("cancelled" as const)
        : contract.revokedAt
          ? ("revoked" as const)
          : valid
            ? contract.status === "amended"
              ? ("amended" as const)
              : ("registered" as const)
            : ("integrity_error" as const),
    ...(amendedBy ? { amendedBy } : {}),
    legacy: registration.legacy,
    downloadAvailable:
      !registration.legacy && valid && !contract.revokedAt && contract.status !== "cancelled",
    pageCount: pdf.pageCount,
    title: contract.title,
    code: contract.verificationCode,
    activatedAt: contract.activatedAt,
    revokedAt: contract.revokedAt,
    signatoryCount: signers.length,
    signatories: signers.map((signer) => ({
      name: maskName(signer.name),
      signedAt: signer.signedAt,
    })),
    documentSha256: contract.documentSha256,
    finalPdfSha256: contract.signedPdfSha256,
    auditChainValid,
    evidenceChainValid,
    systemSignatureValid,
    pdfIntegrityValid,
  };
}

export async function verifyPdfFile(bytes: Buffer) {
  return verifyPdfSha256(sha256(bytes));
}

/**
 * Looks a document up by the SHA-256 of its exact bytes. The page computes it in the browser, so the
 * PDF never leaves the visitor's device; a hash reveals nothing about a document one does not hold.
 */
export async function verifyPdfSha256(hash: string) {
  hash = hash.toLowerCase();
  const [contract] = await db.select().from(contracts).where(eq(contracts.signedPdfSha256, hash));
  if (contract?.verificationCode) {
    const result = await publicVerification(contract.verificationCode);
    return {
      matches: true,
      code: contract.verificationCode,
      status: result.status,
      systemSignatureValid: "systemSignatureValid" in result && result.systemSignatureValid,
      ...summary(result),
    };
  }
  // Not the signed original: it may still be a marked copy this system handed out.
  const copy = await findIssuedCopy(hash);
  if (copy) {
    const code = copy.contract.verificationCode;
    const result = code ? await publicVerification(code) : null;
    return {
      matches: false,
      issuedCopy: {
        kind: copy.kind,
        stamp: copy.stamp,
        issuedAt: copy.issuedAt,
        // Signed contracts answer with their verification state; unsigned ones only say so.
        signed: !!code,
      },
      code,
      status: result?.status ?? "not_found",
      systemSignatureValid:
        !!result && "systemSignatureValid" in result && result.systemSignatureValid,
      ...(result ? summary(result) : {}),
    };
  }
  return { matches: false, status: "not_found", systemSignatureValid: false };
}

/** Minimal data to show with a file result (the uploader already holds the document). */
function summary(result: PublicVerification) {
  if (!("title" in result)) return {};
  return { title: result.title, activatedAt: result.activatedAt, revokedAt: result.revokedAt };
}

export async function verifyPdfHash(code: string, hash: string) {
  const result = await publicVerification(code);
  const expected = "finalPdfSha256" in result ? result.finalPdfSha256 : null;
  const match =
    !!expected &&
    /^[a-f0-9]{64}$/i.test(expected) &&
    timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hash, "hex"));
  return { match, status: result.status };
}

/**
 * Clean copy of the signed original. Private: only people who can open the contract in the app get
 * it (staff with access and its signatories); the public page only compares documents.
 */
export async function officialPdfCopy(code: string, ip: string, actor: Actor) {
  const registration = await findVerificationCode(code);
  if (!registration || registration.revoked || registration.legacy)
    throw new ApiError(404, "NOT_FOUND", "No se encontró la copia de verificación.");
  const result = await publicVerification(code);
  if (!("downloadAvailable" in result) || !result.downloadAvailable)
    throw new ApiError(404, "NOT_FOUND", "No se encontró la copia de verificación.");
  return db.transaction(async (tx) => {
    const contract = await getContract(tx, registration.contractId, true);
    if (!canRead(contract, actor, await getSignatories(tx, contract.id)))
      throw new ApiError(404, "NOT_FOUND", "No se encontró la copia de verificación.");
    const current = await findVerificationCode(code, tx);
    if (
      !current ||
      current.revoked ||
      current.legacy ||
      contract.revokedAt ||
      contract.status === "cancelled" ||
      !contract.signedPdfPath
    )
      throw new ApiError(404, "NOT_FOUND", "No se encontró la copia de verificación.");
    const bytes = await storage.get("contracts/" + contract.signedPdfPath);
    if (sha256(bytes) !== contract.signedPdfSha256)
      throw new ApiError(409, "CONFLICT", "El PDF final no supera la verificación de integridad.");
    const copy = await verificationCopy(bytes);
    await recordIssuedCopy(
      copy,
      { contractId: contract.id, kind: "verification", issuedBy: actor.id },
      tx,
    );
    await audit(tx, {
      contractId: contract.id,
      entityType: "contract",
      entityId: contract.id,
      action: "verification_pdf_downloaded",
      userId: actor.id,
      ip: maskIp(ip),
    });
    return copy;
  });
}
