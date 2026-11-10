import type { Actor, Contract, Signatory } from "./service.js";

export function isContractEditor(contract: Contract, actor: Actor) {
  return actor.role === "admin" || (actor.role === "gestor" && contract.createdBy === actor.id);
}

export function canAmend(contract: Contract, actor: Actor) {
  return isContractEditor(contract, actor) && isAmendmentSource(contract);
}

export function isAmendmentSource(contract: Contract) {
  return (
    ["active", "expiring_soon", "expired"].includes(contract.status) &&
    !!contract.signedPdfPath &&
    !!contract.systemSeal &&
    !contract.revokedAt &&
    !contract.amendedByContractId
  );
}

export function signaturesMutable(contract: Contract) {
  return (
    contract.status === "pending_signatures" &&
    !contract.activatedAt &&
    !contract.signedPdfPath &&
    !contract.signedPdfSha256 &&
    !contract.systemSeal
  );
}

export function canResetSignature(contract: Contract, actor: Actor, signer: Signatory) {
  return (
    isContractEditor(contract, actor) &&
    signaturesMutable(contract) &&
    signer.status === "signed" &&
    signer.userId !== actor.id
  );
}
