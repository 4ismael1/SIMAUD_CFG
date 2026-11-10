import type { FastifyRequest } from "fastify";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "../../db/client.js";
import {
  contracts,
  contractSignatories as signatories,
  contractApprovals as approvals,
  contractCancellations as cancellations,
  users,
} from "../../db/schema.js";
import { ApiError } from "../../lib/errors.js";
import { parse, actionInput, cancelInput } from "./schemas.js";
import { transition, overrideTransition } from "./state-machine.js";
import * as contractService from "./service.js";
import { canReview, isOwnReview } from "./review-permissions.js";
import { getPendingApprovalRequester } from "./approval-queries.js";
export type ContractAction =
  | "submit"
  | "approve"
  | "reject"
  | "cancel"
  | "uncancel"
  | "archive"
  | "unarchive"
  | "override-status"
  | "remind"
  | "decline";
interface ActionContext {
  tx: Transaction;
  req: FastifyRequest;
  contract: contractService.Contract;
  allSignatories: contractService.Signatory[];
  input: z.infer<typeof actionInput>;
  id: string;
  action: ContractAction;
}
interface ActionResult {
  next: contractService.Contract["status"];
  changes: Partial<typeof contracts.$inferInsert>;
  auditAction?: string;
}

async function archiveContract(context: ActionContext): Promise<ActionResult> {
  const { req, contract, allSignatories, id, action } = context;
  const can = contractService.permissions(contract, req.user, allSignatories);
  let next = contract.status;
  let changes: Partial<typeof contracts.$inferInsert> = {};

  if (!can.archive) throw contractService.forbidden();
  if (contract.archived === (action === "archive")) throw contractService.conflict();
  changes = {
    archived: action === "archive",
    archivedAt: action === "archive" ? new Date() : null,
    archivedBy: action === "archive" ? req.user.id : null,
  };

  return { next, changes };
}

async function remindSignatory(context: ActionContext): Promise<ActionResult> {
  const { tx, req, contract, allSignatories, input, id } = context;
  let next = contract.status;
  let changes: Partial<typeof contracts.$inferInsert> = {};

  if (!contractService.canManage(contract, req.user)) throw contractService.forbidden();
  if (contract.status !== "pending_signatures") throw contractService.conflict();
  const target = allSignatories.find((item) => item.id === input.signatoryId);
  if (
    !target ||
    target.status !== "pending" ||
    allSignatories.some(
      (item) => item.signingOrder < target.signingOrder && item.status !== "signed",
    )
  )
    throw contractService.conflict("El firmante no tiene turno.");
  if (target.lastRemindedAt && Date.now() - target.lastRemindedAt.getTime() < 3600000)
    throw new ApiError(429, "RATE_LIMITED", "Solo se permite un recordatorio por hora.");
  await tx
    .update(signatories)
    .set({ lastRemindedAt: new Date() })
    .where(eq(signatories.id, target.id));
  await contractService.notify(
    tx,
    contract,
    "signature_required",
    [target],
    "Recordatorio: tu firma es requerida.",
  );

  return { next, changes };
}

async function submitForApproval(context: ActionContext): Promise<ActionResult> {
  const { tx, req, contract, allSignatories, id } = context;
  const can = contractService.permissions(contract, req.user, allSignatories);
  let next = contract.status;
  let changes: Partial<typeof contracts.$inferInsert> = {};

  if (!can.submit) {
    if (
      !["admin", "gestor"].includes(req.user.role) ||
      (req.user.role === "gestor" && contract.createdBy !== req.user.id)
    )
      throw contractService.forbidden();
    throw contractService.conflict();
  }
  next = transition(contract.status, "submit");
  await tx
    .update(signatories)
    .set({ status: "pending" })
    .where(and(eq(signatories.contractId, id), eq(signatories.status, "declined")));
  await tx.insert(approvals).values({
    contractId: id,
    versionNumber: contract.currentVersion,
    requestedBy: req.user.id,
  });
  const reviewers = await tx
    .select({ userId: users.id })
    .from(users)
    .where(
      and(
        inArray(users.role, ["admin", "supervisor"]),
        eq(users.isActive, true),
        isNull(users.deletedAt),
      ),
    );
  await contractService.notify(
    tx,
    contract,
    "approval_needed",
    reviewers,
    "Contrato pendiente de aprobación.",
  );

  return { next, changes };
}

async function reviewApproval(context: ActionContext): Promise<ActionResult> {
  const { tx, req, contract, input, id, action } = context;
  const creator = [{ userId: contract.createdBy }];
  let next = contract.status;
  let changes: Partial<typeof contracts.$inferInsert> = {};

  const requestedBy = await getPendingApprovalRequester(tx, id);
  if (!canReview(contract, req.user, requestedBy)) throw contractService.forbidden();
  next = transition(contract.status, action);
  if (action === "reject" && !input.comment)
    throw contractService.invalid("El comentario es obligatorio.");
  const [pending] = await tx
    .update(approvals)
    .set({
      status: action === "approve" ? "approved" : "rejected",
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
      comments: input.comment,
    })
    .where(and(eq(approvals.contractId, id), eq(approvals.status, "pending")))
    .returning();
  if (!pending) throw contractService.conflict("No hay aprobación pendiente.");
  changes =
    action === "approve"
      ? { approvedBy: req.user.id, approvedAt: new Date(), rejectionReason: null }
      : { rejectionReason: input.comment };
  await contractService.notify(
    tx,
    contract,
    "approval_result",
    creator,
    action === "approve"
      ? "Contrato aprobado." + (input.comment ? " " + input.comment : "")
      : "Contrato rechazado: " + input.comment,
  );
  if (action === "approve") await contractService.nextSigners(tx, contract);
  const auditAction =
    action === "approve" &&
    req.user.role === "admin" &&
    isOwnReview(contract, req.user, requestedBy)
      ? "approved_own"
      : action;
  return { next, changes, auditAction };
}

async function cancelContract(context: ActionContext): Promise<ActionResult> {
  const { tx, req, contract, allSignatories, id } = context;
  const creator = [{ userId: contract.createdBy }];
  let next = contract.status;
  let changes: Partial<typeof contracts.$inferInsert> = {};

  if (!contractService.canManage(contract, req.user)) throw contractService.forbidden();
  const cancel = parse(cancelInput, req.body);
  next = transition(contract.status, "cancel");
  changes = { previousStatus: contract.status };
  await tx.insert(cancellations).values({
    contractId: id,
    cancelledBy: req.user.id,
    reason: cancel.reason,
    description: cancel.description,
    status: "approved",
    approvedBy: req.user.id,
    approvedAt: new Date(),
  });
  await contractService.notify(
    tx,
    contract,
    "contract_cancelled",
    [...creator, ...allSignatories],
    "Contrato cancelado: " + cancel.description,
  );

  return { next, changes };
}

async function restoreContract(context: ActionContext): Promise<ActionResult> {
  const { tx, req, contract } = context;
  let next = contract.status;
  let changes: Partial<typeof contracts.$inferInsert> = {};

  if (req.user.role !== "admin") throw contractService.forbidden();
  next = transition(contract.status, "uncancel", contract.previousStatus);
  changes = { previousStatus: null };
  if (next === "pending_signatures") await contractService.nextSigners(tx, contract);

  return { next, changes };
}

async function declineSignature(context: ActionContext): Promise<ActionResult> {
  const { tx, req, contract, allSignatories, input, id } = context;
  const creator = [{ userId: contract.createdBy }];
  let next = contract.status;
  let changes: Partial<typeof contracts.$inferInsert> = {};

  const me = allSignatories.find((item) => item.userId === req.user.id);
  if (!me) throw contractService.forbidden();
  if (me.status !== "pending") throw contractService.conflict();
  if (!input.reason) throw contractService.invalid("El motivo es obligatorio.");
  next = transition(contract.status, "decline");
  await tx.update(signatories).set({ status: "declined" }).where(eq(signatories.id, me.id));
  changes = { rejectionReason: input.reason };
  await contractService.notify(
    tx,
    contract,
    "approval_result",
    creator,
    "Firma rechazada: " + input.reason,
  );

  return { next, changes };
}

async function overrideContractStatus(context: ActionContext): Promise<ActionResult> {
  const { tx, req, contract, allSignatories, input, id } = context;
  const can = contractService.permissions(contract, req.user, allSignatories);
  const creator = [{ userId: contract.createdBy }];
  let next = contract.status;
  let changes: Partial<typeof contracts.$inferInsert> = {};

  if (!can.override) throw contractService.forbidden();
  if (!input.reason || !input.status)
    throw contractService.invalid("Estado y motivo obligatorios.");
  next = overrideTransition(contract.status, input.status, contract.previousStatus);
  if (next === "pending_approval") {
    await tx
      .update(signatories)
      .set({ status: "pending" })
      .where(and(eq(signatories.contractId, id), eq(signatories.status, "declined")));
    await tx.insert(approvals).values({
      contractId: id,
      versionNumber: contract.currentVersion,
      requestedBy: req.user.id,
    });
    const reviewers = await tx
      .select({ userId: users.id })
      .from(users)
      .where(
        and(
          inArray(users.role, ["admin", "supervisor"]),
          eq(users.isActive, true),
          isNull(users.deletedAt),
        ),
      );
    await contractService.notify(
      tx,
      contract,
      "approval_needed",
      reviewers,
      "Aprobación solicitada por administrador.",
    );
  }
  if (
    contract.status === "pending_approval" &&
    (next === "pending_signatures" || next === "rejected")
  ) {
    const [review] = await tx
      .update(approvals)
      .set({
        status: next === "rejected" ? "rejected" : "approved",
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        comments: input.reason,
      })
      .where(and(eq(approvals.contractId, id), eq(approvals.status, "pending")))
      .returning();
    if (!review) throw contractService.conflict("No hay aprobación pendiente.");
    if (next === "pending_signatures")
      changes = { approvedBy: req.user.id, approvedAt: new Date(), rejectionReason: null };
    await contractService.notify(
      tx,
      contract,
      "approval_result",
      creator,
      "Decisión administrativa: " + input.reason,
    );
  }
  if (next === "rejected") {
    changes.rejectionReason = input.reason;
    if (contract.status !== "pending_approval")
      await contractService.notify(
        tx,
        contract,
        "approval_result",
        creator,
        "Contrato rechazado: " + input.reason,
      );
  }
  if (next === "pending_signatures") await contractService.nextSigners(tx, contract);
  if (next === "active" && contract.status !== "cancelled")
    await contractService.notify(
      tx,
      contract,
      "contract_signed",
      [...creator, ...allSignatories],
      "Contrato activado por administrador: " + input.reason,
    );
  if (next === "cancelled") {
    changes.previousStatus = contract.status;
    await tx.insert(cancellations).values({
      contractId: id,
      cancelledBy: req.user.id,
      reason: "other",
      description: input.reason,
      status: "approved",
      approvedBy: req.user.id,
      approvedAt: new Date(),
    });
    await contractService.notify(
      tx,
      contract,
      "contract_cancelled",
      [...creator, ...allSignatories],
      "Contrato cancelado: " + input.reason,
    );
  }
  if (contract.status === "cancelled") changes.previousStatus = null;
  if (next === "draft") {
    changes.currentVersion = contract.currentVersion + 1;
    await tx
      .update(signatories)
      .set({
        status: "pending",
        signaturePath: null,
        signedAt: null,
        viewedAt: null,
        acceptedDeclarationAt: null,
        ip: null,
        userAgent: null,
      })
      .where(eq(signatories.contractId, id));
  }

  return { next, changes };
}

export function applyContractAction(context: ActionContext): Promise<ActionResult> {
  const handlers: Record<ContractAction, (context: ActionContext) => Promise<ActionResult>> = {
    archive: archiveContract,
    unarchive: archiveContract,
    remind: remindSignatory,
    submit: submitForApproval,
    approve: reviewApproval,
    reject: reviewApproval,
    cancel: cancelContract,
    uncancel: restoreContract,
    decline: declineSignature,
    "override-status": overrideContractStatus,
  };
  return handlers[context.action](context);
}
