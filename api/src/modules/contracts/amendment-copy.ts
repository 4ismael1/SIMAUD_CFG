import type { FastifyRequest } from "fastify";
import type { Transaction } from "../../db/client.js";
import { contracts } from "../../db/schema.js";
import { historicalDefinitions } from "./variable-history.js";
import * as service from "./service.js";

export async function copyAmendment(
  tx: Transaction,
  req: FastifyRequest,
  original: service.Contract,
  root: service.Contract,
  number: number,
  reason: string,
) {
  const [child] = await tx
    .insert(contracts)
    .values(amendmentValues(original, root, number, reason, req.user.id))
    .returning();
  const signers = await service.getSignatories(tx, original.id);
  // Resolve access from confirmed email again; never inherit stale identity bindings.
  await service.reconcileSignatories(
    tx,
    child!.id,
    signers.map((signer) => ({
      name: signer.name,
      email: signer.email,
      phone: signer.phone ?? undefined,
      cedula: signer.cedula ?? undefined,
      role: signer.role,
      roleLabel: signer.roleLabel,
      slotIndex: signer.slotIndex,
      signingOrder: signer.signingOrder,
    })),
  );
  await service.snapshot(
    tx,
    child!,
    req.user,
    "Enmienda: " + reason,
    await historicalDefinitions(tx, original),
  );
  return child!;
}

function amendmentValues(
  original: service.Contract,
  root: service.Contract,
  number: number,
  reason: string,
  actorId: string,
) {
  return {
    code: `${root.code}-E${number}`,
    amendsContractId: original.id,
    amendmentRootId: root.id,
    amendmentNumber: number,
    amendmentReason: reason,
    createdBy: original.createdBy,
    originalCreatedBy: actorId,
    templateId: original.templateId,
    title: original.title,
    content: original.content,
    contentFormat: original.contentFormat,
    generatedContent: original.generatedContent,
    variablesData: original.variablesData,
    contractValue: original.contractValue,
    currency: original.currency,
    startDate: original.startDate,
    endDate: original.endDate,
    notes: original.notes,
    clientName: original.clientName,
    clientEmail: original.clientEmail,
    clientPhone: original.clientPhone,
    autoRenewal: original.autoRenewal,
  };
}
