import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { contracts, contractAuditLogs } from "../../db/schema.js";
import { verifyAuditChain } from "../../lib/crypto/audit-chain.js";
import { verifySystemSeal } from "../../lib/crypto/system-signing.js";
import { documentHash, sha256 } from "../../lib/crypto/canonical.js";
import { storage } from "../../lib/storage.js";
import { getSignatories, type Contract } from "../contracts/service.js";
import { verifyEvidenceChain } from "../contracts/evidence.js";

export function verifyContractSeal(contract: Contract) {
  const seal = contract.systemSeal;
  return (
    !!seal &&
    verifySystemSeal(seal) &&
    seal.payload.contractId === contract.id &&
    seal.payload.contractVersion === contract.currentVersion &&
    seal.payload.verificationCode === contract.verificationCode &&
    seal.payload.activatedAt === contract.activatedAt?.toISOString() &&
    seal.payload.documentSha256 === contract.documentSha256 &&
    seal.payload.documentSha256 === documentHash(contract.generatedContent ?? contract.content) &&
    seal.payload.finalPdfSha256 === contract.signedPdfSha256 &&
    seal.payload.evidenceHead === contract.evidenceHead
  );
}

async function pdfIntact(contract: Contract) {
  if (!contract.signedPdfPath) return false;
  try {
    return (
      sha256(await storage.get("contracts/" + contract.signedPdfPath)) === contract.signedPdfSha256
    );
  } catch {
    return false;
  }
}
const maskName = (name: string) =>
  name
    .trim()
    .split(/\s+/u)
    .map((part) => [...part][0] + "***")
    .join(" ");

export async function publicVerification(code: string) {
  const [contract] = await db.select().from(contracts).where(eq(contracts.verificationCode, code));
  if (!contract) return { status: "not_found" as const };
  const [auditChainValid, evidenceChainValid, pdfIntegrityValid] = await Promise.all([
    verifyAuditChain(contract.id),
    verifyEvidenceChain(contract.id),
    pdfIntact(contract),
  ]);
  const [anchor] = contract.systemSeal?.payload.auditHead
    ? await db
        .select({ id: contractAuditLogs.id })
        .from(contractAuditLogs)
        .where(
          and(
            eq(contractAuditLogs.chainContractId, contract.id),
            eq(contractAuditLogs.entryHash, contract.systemSeal.payload.auditHead),
          ),
        )
    : [];
  const systemSignatureValid = verifyContractSeal(contract) && !!anchor;
  const valid = auditChainValid && evidenceChainValid && pdfIntegrityValid && systemSignatureValid;
  const signers = await getSignatories(db, contract.id);
  return {
    status:
      contract.revokedAt || contract.status === "cancelled"
        ? ("revoked" as const)
        : valid
          ? ("valid" as const)
          : ("invalid" as const),
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
  const hash = sha256(bytes);
  const [contract] = await db.select().from(contracts).where(eq(contracts.signedPdfSha256, hash));
  if (!contract || !contract.verificationCode)
    return { matches: false, status: "not_found", systemSignatureValid: false };
  const result = await publicVerification(contract.verificationCode);
  return {
    matches: true,
    code: contract.verificationCode,
    status: result.status,
    systemSignatureValid: "systemSignatureValid" in result && result.systemSignatureValid,
  };
}
