import { and, eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { contracts, contractVersions, signatureEvidence } from "../../db/schema.js";
import { canonicalJson, documentHash, sha256 } from "../../lib/crypto/canonical.js";
import { storage } from "../../lib/storage.js";
import { getContract, getSignatories, type Contract, type Signatory } from "./service.js";

export const signingDeclaration =
  "Declaro que he leído el documento completo, comprendo su contenido y acepto firmarlo electrónicamente con sellado del sistema.";
export interface EvidencePayload {
  format: "simaud-evidence-v1";
  contractId: string;
  contractVersion: number;
  sequence: number;
  signatoryId: string;
  userId: string;
  name: string;
  role: string;
  documentSha256: string;
  signatureImageSha256: string;
  signaturePath: string;
  signedAt: string;
  ip: string;
  userAgent: string;
  viewedAt: string;
  acceptedDeclarationAt: string;
  declaration: string;
  declarationVersion: 1;
  sessionId: string;
  authenticationMethod: "password-session";
  method: "typed" | "drawn" | "uploaded" | "unknown";
  fontId: string | null;
  previousEvidenceHash: string | null;
}

export async function recordEvidence(
  tx: Transaction,
  contract: Contract,
  payload: Omit<
    EvidencePayload,
    | "format"
    | "sequence"
    | "previousEvidenceHash"
    | "documentSha256"
    | "contractId"
    | "contractVersion"
  >,
) {
  const current = await getContract(tx, contract.id, true);
  const evidence: EvidencePayload = {
    ...payload,
    format: "simaud-evidence-v1",
    contractId: contract.id,
    contractVersion: contract.currentVersion,
    sequence: current.evidenceCount + 1,
    previousEvidenceHash: current.evidenceHead,
    documentSha256: documentHash(contract.generatedContent ?? contract.content),
  };
  const evidenceHash = sha256(canonicalJson(evidence));
  await tx.insert(signatureEvidence).values({
    contractId: contract.id,
    signatoryId: payload.signatoryId,
    contractVersion: contract.currentVersion,
    sequence: evidence.sequence,
    payload: evidence,
    previousEvidenceHash: evidence.previousEvidenceHash,
    evidenceHash,
  });
  await tx
    .update(contracts)
    .set({
      evidenceHead: evidenceHash,
      evidenceCount: evidence.sequence,
      updatedAt: current.updatedAt,
    })
    .where(eq(contracts.id, contract.id));
}

async function verifyEvidenceDocument(
  tx: Transaction | typeof db,
  contract: Contract,
  payload: EvidencePayload,
) {
  if (payload.contractVersion === contract.currentVersion)
    return payload.documentSha256 === documentHash(contract.generatedContent ?? contract.content);
  const [version] = await tx
    .select()
    .from(contractVersions)
    .where(
      and(
        eq(contractVersions.contractId, contract.id),
        eq(contractVersions.versionNumber, payload.contractVersion),
      ),
    );
  return (
    !!version &&
    payload.documentSha256 === documentHash(version.generatedContent ?? version.content)
  );
}

async function verifySigner(
  signer: Signatory | undefined,
  payload: EvidencePayload,
  currentVersion: number,
) {
  if (
    payload.contractVersion === currentVersion &&
    (!signer ||
      signer.status !== "signed" ||
      signer.signedAt?.toISOString() !== payload.signedAt ||
      signer.userId !== payload.userId ||
      signer.name !== payload.name ||
      signer.role !== payload.role ||
      signer.viewedAt?.toISOString() !== payload.viewedAt ||
      signer.acceptedDeclarationAt?.toISOString() !== payload.acceptedDeclarationAt ||
      signer.ip !== payload.ip ||
      (signer.userAgent ?? "") !== payload.userAgent ||
      signer.signaturePath !== payload.signaturePath)
  )
    return false;
  try {
    return (
      sha256(await storage.get("signatures/" + payload.signaturePath)) ===
      payload.signatureImageSha256
    );
  } catch {
    return false;
  }
}

export async function verifyEvidenceChain(contractId: string, tx: Transaction | typeof db = db) {
  const contract = await getContract(tx, contractId);
  const rows = await tx
    .select()
    .from(signatureEvidence)
    .where(eq(signatureEvidence.contractId, contractId))
    .orderBy(signatureEvidence.sequence);
  const signers = await getSignatories(tx, contractId);
  if (
    rows.length !== contract.evidenceCount ||
    signers.filter((signer) => signer.status === "signed").length !==
      rows.filter((row) => row.contractVersion === contract.currentVersion).length
  )
    return false;
  let previous: string | null = null;
  for (const [index, row] of rows.entries()) {
    const payload = row.payload;
    if (
      row.sequence !== index + 1 ||
      row.previousEvidenceHash !== previous ||
      payload.previousEvidenceHash !== previous ||
      payload.sequence !== row.sequence ||
      payload.contractId !== contractId ||
      payload.signatoryId !== row.signatoryId ||
      payload.contractVersion !== row.contractVersion ||
      sha256(canonicalJson(payload)) !== row.evidenceHash ||
      !(await verifyEvidenceDocument(tx, contract, payload)) ||
      !(await verifySigner(
        signers.find((signer) => signer.id === row.signatoryId),
        payload,
        contract.currentVersion,
      ))
    )
      return false;
    previous = row.evidenceHash;
  }
  return previous === contract.evidenceHead;
}
