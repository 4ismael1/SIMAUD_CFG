import type { FastifyRequest } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { contractSignatories, signatureEvidence } from "../../db/schema.js";
import { recordEvidence } from "./evidence.js";
import { mirrorAmendmentEvent } from "./amendments.js";
import { isContractEditor, signaturesMutable } from "./amendment-permissions.js";
import * as service from "./service.js";

export async function resetSignatures(
  req: FastifyRequest,
  id: string,
  reason: string,
  signatoryId?: string,
) {
  return db.transaction(async (tx) => {
    const contract = await service.getContract(tx, id, true);
    await service.linkSignatories(tx, req.user, id);
    const signers = await service.getSignatories(tx, id);
    const { selected, target } = resetTargets(contract, req.user, signers, signatoryId);
    for (const signer of selected) await supersedeSignature(tx, req, contract, signer, reason);
    await notifyReset(tx, contract, target);
    const action = signatoryId ? "signature_reset" : "signatures_reset";
    const details = { reason, signatoryIds: selected.map((signer) => signer.id) };
    await service.record(tx, req, contract, action, null, details);
    await mirrorAmendmentEvent(tx, req, contract, action, details);
    return { message: signatoryId ? "Nueva firma solicitada." : "Firmas reiniciadas." };
  });
}

async function supersedeSignature(
  tx: Transaction,
  req: FastifyRequest,
  contract: service.Contract,
  signer: service.Signatory,
  reason: string,
) {
  const [previous] = await tx
    .select()
    .from(signatureEvidence)
    .where(
      and(
        eq(signatureEvidence.signatoryId, signer.id),
        eq(signatureEvidence.contractVersion, contract.currentVersion),
      ),
    )
    .orderBy(desc(signatureEvidence.sequence))
    .limit(1);
  if (!previous || previous.payload.event === "superseded")
    throw service.conflict("La firma no tiene evidencia verificable.");
  await recordEvidence(tx, contract, {
    ...previous.payload,
    event: "superseded",
    supersedesEvidenceHash: previous.evidenceHash,
    reason,
    eventUserId: req.user.id,
    recordedAt: new Date().toISOString(),
    eventSessionId: req.sessionId!,
    eventIp: req.ip,
    eventUserAgent: req.headers["user-agent"] ?? "",
  });
  await tx
    .update(contractSignatories)
    .set({
      status: "pending",
      signaturePath: null,
      placement: null,
      signedAt: null,
      viewedAt: null,
      acceptedDeclarationAt: null,
      ip: null,
      userAgent: null,
      lastRemindedAt: null,
    })
    .where(eq(contractSignatories.id, signer.id));
}

function resetTargets(
  contract: service.Contract,
  actor: service.Actor,
  signers: service.Signatory[],
  signatoryId?: string,
) {
  if (!service.canRead(contract, actor, signers)) throw service.notFound();
  if (!isContractEditor(contract, actor)) throw service.forbidden();
  if (!signaturesMutable(contract))
    throw service.conflict(
      "Las firmas solo se pueden reiniciar antes de la activación; crea una enmienda.",
    );
  const target = signatoryId ? signers.find((signer) => signer.id === signatoryId) : undefined;
  if (signatoryId && !target) throw service.notFound();
  const selected = signers.filter(
    (signer) => signer.status === "signed" && (!signatoryId || signer.id === signatoryId),
  );
  if (!selected.length) throw service.conflict("No hay firmas vigentes que anular.");
  if (selected.some((signer) => signer.userId === actor.id)) throw service.forbidden();
  return { selected, target };
}

async function notifyReset(
  tx: Transaction,
  contract: service.Contract,
  target: service.Signatory | undefined,
) {
  const firstPending = (await service.getSignatories(tx, contract.id)).find(
    (signer) => signer.status === "pending",
  );
  if (target && target.signingOrder !== firstPending?.signingOrder)
    await service.notify(
      tx,
      contract,
      "signature_required",
      [target],
      "Se solicitó una nueva firma.",
    );
  await service.nextSigners(tx, contract);
}
