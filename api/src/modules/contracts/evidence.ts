import type { SignaturePlacement } from "../../lib/signature-placement.js";
import { contentDocumentHash, matchesDocumentHash } from "../../lib/rich-doc/content.js";
import { and, eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { contracts, contractVersions, signatureEvidence } from "../../db/schema.js";
import { canonicalJson, sha256 } from "../../lib/crypto/canonical.js";
import { storage } from "../../lib/storage.js";
import { getContract, getSignatories, type Contract, type Signatory } from "./service.js";

export const signingDeclaration =
  "Declaro que he leído el documento completo, comprendo su contenido y acepto firmarlo electrónicamente con sellado del sistema.";
export interface EvidencePayload {
  format: "simaud-evidence-v1" | "simaud-evidence-v2";
  placement?: SignaturePlacement;
  event?: "signed" | "resigned" | "placement_adjusted" | "superseded";
  supersedesEvidenceHash?: string | null;
  recordedAt?: string;
  reason?: string;
  eventUserId?: string;
  eventSessionId?: string;
  eventIp?: string;
  eventUserAgent?: string;
  contractId: string;
  contractVersion: number;
  sequence: number;
  signatoryId: string;
  userId: string;
  name: string;
  role: string;
  roleLabel?: string;
  slotIndex?: number | null;
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
    format: payload.event || payload.placement ? "simaud-evidence-v2" : "simaud-evidence-v1",
    contractId: contract.id,
    contractVersion: contract.currentVersion,
    sequence: current.evidenceCount + 1,
    previousEvidenceHash: current.evidenceHead,
    documentSha256: contentDocumentHash(
      contract.generatedContent ?? contract.content,
      contract.contentFormat,
    ),
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
    return matchesDocumentHash(
      contract.generatedContent ?? contract.content,
      contract.contentFormat,
      payload.documentSha256,
    );
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
    matchesDocumentHash(
      version.generatedContent ?? version.content,
      version.contentFormat,
      payload.documentSha256,
    )
  );
}

async function verifySigner(
  signer: Signatory | undefined,
  payload: EvidencePayload,
  currentVersion: number,
  latest: boolean,
) {
  if (latest && payload.contractVersion === currentVersion && payload.event === "superseded") {
    if (
      !signer ||
      signer.status === "signed" ||
      signer.signaturePath ||
      signer.signedAt ||
      signer.placement ||
      signer.viewedAt ||
      signer.acceptedDeclarationAt ||
      signer.ip ||
      signer.userAgent
    )
      return false;
    latest = false;
  }
  if (
    latest &&
    payload.contractVersion === currentVersion &&
    (!signer ||
      signer.status !== "signed" ||
      signer.signedAt?.toISOString() !== payload.signedAt ||
      signer.userId !== payload.userId ||
      signer.name !== payload.name ||
      signer.role !== payload.role ||
      (payload.roleLabel !== undefined && signer.roleLabel !== payload.roleLabel) ||
      (payload.slotIndex !== undefined && signer.slotIndex !== payload.slotIndex) ||
      signer.viewedAt?.toISOString() !== payload.viewedAt ||
      signer.acceptedDeclarationAt?.toISOString() !== payload.acceptedDeclarationAt ||
      signer.ip !== payload.ip ||
      (signer.userAgent ?? "") !== payload.userAgent ||
      signer.signaturePath !== payload.signaturePath ||
      (payload.format === "simaud-evidence-v2" &&
        canonicalJson(signer.placement) !== canonicalJson(payload.placement)))
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

function originalSignature(payload: EvidencePayload) {
  const {
    placement: _placement,
    event: _event,
    supersedesEvidenceHash: _supersedes,
    recordedAt: _recorded,
    reason: _reason,
    eventUserId: _actor,
    eventSessionId: _session,
    eventIp: _ip,
    eventUserAgent: _agent,
    sequence: _sequence,
    previousEvidenceHash: _previous,
    format: _format,
    ...unchanged
  } = payload;
  return canonicalJson(unchanged);
}

function validEvidenceSuccessor(
  payload: EvidencePayload,
  prior: typeof signatureEvidence.$inferSelect | undefined,
) {
  if (payload.format === "simaud-evidence-v1") return !prior;
  if (
    payload.format !== "simaud-evidence-v2" ||
    (!payload.placement && payload.event !== "superseded") ||
    !payload.recordedAt ||
    !payload.event ||
    payload.supersedesEvidenceHash !== (prior?.evidenceHash ?? null) ||
    (prior ? payload.event === "signed" : payload.event !== "signed")
  )
    return false;
  if (payload.event === "superseded")
    return (
      !!prior &&
      prior.payload.event !== "superseded" &&
      !!payload.reason?.trim() &&
      payload.reason.length <= 500 &&
      !!payload.eventUserId &&
      !!payload.eventSessionId &&
      originalSignature(payload) === originalSignature(prior.payload)
    );
  if (prior?.payload.event === "superseded" && payload.event !== "resigned") return false;
  if (payload.event === "placement_adjusted" && prior)
    return (
      !!payload.eventSessionId && originalSignature(payload) === originalSignature(prior.payload)
    );
  return true;
}

export async function verifyEvidenceChain(contractId: string, tx: Transaction | typeof db = db) {
  const contract = await getContract(tx, contractId);
  const rows = await tx
    .select()
    .from(signatureEvidence)
    .where(eq(signatureEvidence.contractId, contractId))
    .orderBy(signatureEvidence.sequence);
  const signers = await getSignatories(tx, contractId);
  const latestBySigner = new Map<string, (typeof rows)[number]>();
  for (const row of rows) latestBySigner.set(`${row.contractVersion}:${row.signatoryId}`, row);
  if (
    rows.length !== contract.evidenceCount ||
    signers.filter((signer) => signer.status === "signed").length !==
      [...latestBySigner.values()].filter(
        (row) =>
          row.contractVersion === contract.currentVersion && row.payload.event !== "superseded",
      ).length
  )
    return false;
  const previousBySigner = new Map<string, (typeof rows)[number]>();
  let previous: string | null = null;
  for (const [index, row] of rows.entries()) {
    const payload = row.payload;
    const key = `${row.contractVersion}:${row.signatoryId}`;
    const prior = previousBySigner.get(key);
    if (!validEvidenceSuccessor(payload, prior)) return false;
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
        latestBySigner.get(key)?.id === row.id,
      ))
    )
      return false;
    previous = row.evidenceHash;
    previousBySigner.set(key, row);
  }
  return previous === contract.evidenceHead;
}
