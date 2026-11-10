import type { FastifyRequest } from "fastify";
import { eq, sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { contracts } from "../../db/schema.js";
import { copyAmendment } from "./amendment-copy.js";
import { canAmend, isContractEditor, isAmendmentSource } from "./amendment-permissions.js";
import * as service from "./service.js";

export async function hasOpenAmendment(tx: Transaction | typeof db, contract: service.Contract) {
  const result = await tx.execute(sql`select 1 from contracts where
    amendment_root_id = ${contract.amendmentRootId ?? contract.id}::uuid
    and status in ('draft', 'rejected', 'pending_approval', 'pending_signatures') limit 1`);
  return result.rows.length > 0;
}

export async function hasOpenRenewal(tx: Transaction | typeof db, id: string) {
  const result = await tx.execute(sql`select 1 from contract_renewals r where
    r.original_contract_id = ${id}::uuid and (r.status = 'pending' or
      (r.status = 'approved' and exists (select 1 from contracts c where c.id = r.new_contract_id
        and c.status not in ('cancelled', 'renewed', 'amended')))) limit 1`);
  return result.rows.length > 0;
}

export async function assertNoRenewal(tx: Transaction, id: string) {
  if (await hasOpenRenewal(tx, id)) throw service.conflict("Ya hay una renovación en curso.");
}

export async function assertAmendmentCanReopen(tx: Transaction, child: service.Contract) {
  if (!child.amendsContractId) return;
  const original = await service.getContract(tx, child.amendsContractId);
  if (!isAmendmentSource(original))
    throw service.conflict("El original ya no admite una enmienda.");
  if (await hasOpenAmendment(tx, child)) throw service.conflict("Ya hay una enmienda abierta.");
  await assertNoRenewal(tx, original.id);
}

export async function createAmendment(req: FastifyRequest, id: string, reason: string) {
  return db.transaction(async (tx) => {
    const original = await service.getContract(tx, id, true);
    const signers = await service.getSignatories(tx, id);
    if (!service.canRead(original, req.user, signers)) throw service.notFound();
    if (!isContractEditor(original, req.user)) throw service.forbidden();
    if (!canAmend(original, req.user)) throw service.conflict("El contrato no admite enmiendas.");
    if (await hasOpenAmendment(tx, original))
      throw service.conflict("Ya hay una enmienda abierta.");
    await assertNoRenewal(tx, id);
    const root = await service.getContract(tx, original.amendmentRootId ?? id);
    const number = root.amendmentSequence + 1;
    await tx
      .update(contracts)
      .set({ amendmentSequence: number, updatedAt: root.updatedAt })
      .where(eq(contracts.id, root.id));
    const child = await copyAmendment(tx, req, original, root, number, reason);
    await service.record(tx, req, child, "amendment_created", null, {
      amendsContractId: id,
      amendmentNumber: number,
      reason,
    });
    await service.record(tx, req, original, "amendment_created", null, {
      amendmentId: child.id,
      amendmentNumber: number,
      reason,
    });
    return {
      id: child.id,
      code: child.code,
      status: child.status,
      amendsContractId: id,
      amendmentNumber: number,
    };
  });
}

export async function activateAmendment(
  tx: Transaction,
  req: FastifyRequest,
  child: service.Contract,
) {
  if (!child.amendsContractId) return;
  const original = await service.getContract(tx, child.amendsContractId);
  if (original.amendedByContractId === child.id) return;
  if (!isAmendmentSource(original))
    throw service.conflict("El original ya no admite una enmienda.");
  await assertNoRenewal(tx, original.id);
  await tx
    .update(contracts)
    .set({ status: "amended", amendedByContractId: child.id })
    .where(eq(contracts.id, original.id));
  const transition = {
    amendmentId: child.id,
    amendmentNumber: child.amendmentNumber,
    code: child.code,
  };
  await service.record(
    tx,
    req,
    original,
    "amendment_activated",
    { status: original.status },
    transition,
  );
  await service.record(
    tx,
    req,
    child,
    "amendment_activated",
    { amendsContractId: original.id },
    transition,
  );
}

export async function mirrorAmendmentEvent(
  tx: Transaction,
  req: FastifyRequest,
  child: service.Contract,
  action: string,
  details: unknown,
) {
  if (!child.amendsContractId) return;
  const original = await service.getContract(tx, child.amendsContractId);
  await service.record(tx, req, original, "amendment_" + action, null, {
    amendmentId: child.id,
    details,
  });
}
