import { hasOpenAmendment } from "../contracts/amendments.js";
import { historicalDefinitions } from "../contracts/variable-history.js";
import { santoDomingoToday } from "../../lib/sql.js";
import type { FastifyRequest } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import {
  contracts,
  contractRenewals as renewals,
  contractSignatories,
  users,
} from "../../db/schema.js";
import * as contractService from "../contracts/service.js";
import { addNotification } from "../notifications/service.js";
import { audit } from "../../lib/audit.js";
import type { RenewalInput, RenewalAction } from "./schemas.js";
import { publicRenewal } from "./queries.js";

export function renewalPriority(days: number) {
  return days <= 15 ? "urgent" : days <= 30 ? "high" : days <= 60 ? "medium" : "low";
}

async function notifyRenewal(
  tx: Transaction,
  contract: contractService.Contract,
  requester: string | null,
  type: string,
  message: string,
) {
  const recipients = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      sql`
        is_active
        and deleted_at is null
        and (
          role in ('admin', 'supervisor')
          or id = ${contract.createdBy}
          or id = ${requester}
        )
      `,
    );
  for (const recipient of recipients)
    await addNotification(tx, {
      userId: recipient.id,
      type,
      title: contract.title,
      message,
      data: { contractId: contract.id },
      actionUrl: "/renovaciones",
    });
}

export async function activateRenewalParent(
  tx: Transaction,
  child: contractService.Contract,
  actorId: string | null,
) {
  if (!child.parentContractId || child.renewalType !== "manual_renewal") return;
  const [approved] = await tx
    .select()
    .from(renewals)
    .where(and(eq(renewals.newContractId, child.id), eq(renewals.status, "approved")));
  if (!approved) return;
  const parent = await contractService.getContract(tx, child.parentContractId, true);
  if (parent.status === "renewed") return;
  if (!["active", "expiring_soon", "expired"].includes(parent.status))
    throw contractService.conflict("El original ya no admite renovación.");
  await tx.update(contracts).set({ status: "renewed" }).where(eq(contracts.id, parent.id));
  await audit(tx, {
    contractId: parent.id,
    entityType: "contract",
    entityId: parent.id,
    action: "renewed",
    userId: actorId,
    oldValues: { status: parent.status },
    newValues: { status: "renewed", childId: child.id },
  });
  await notifyRenewal(
    tx,
    parent,
    approved.requestedBy,
    "renewal_approved",
    "El contrato renovado ya está activo.",
  );
}

export async function requestRenewal(req: FastifyRequest, input: RenewalInput) {
  return db.transaction(async (tx) => {
    const contract = await contractService.getContract(tx, input.contractId, true);
    await contractService.linkSignatories(tx, req.user, contract.id);
    const signatories = await contractService.getSignatories(tx, contract.id);
    if (!contractService.canRead(contract, req.user, signatories)) throw contractService.notFound();
    if (!["active", "expiring_soon", "expired"].includes(contract.status))
      throw contractService.conflict();
    if (await hasOpenAmendment(tx, contract))
      throw contractService.conflict("Ya hay una enmienda abierta.");
    if (
      !contract.endDate ||
      input.proposedStartDate < contract.endDate ||
      input.proposedEndDate <= input.proposedStartDate
    )
      throw contractService.invalid("Fechas de renovación inválidas.");
    const existing = await tx
      .select()
      .from(renewals)
      .where(
        sql`
          original_contract_id = ${contract.id}
          and (
            status = 'pending'
            or (
              status = 'approved'
              and exists (
                select 1
                from contracts c
                where c.id = new_contract_id
                and c.status not in ('cancelled', 'renewed')
              )
            )
          )
        `,
      );
    if (existing.length) throw contractService.conflict("Ya hay una renovación en curso.");
    const [date] = await tx
      .execute<{ days: number }>(
        sql`select ${contract.endDate}::date - ${santoDomingoToday} as days`,
      )
      .then((result) => result.rows);
    const [created] = await tx
      .insert(renewals)
      .values({
        originalContractId: contract.id,
        requestedBy: req.user.id,
        proposedStartDate: input.proposedStartDate,
        proposedEndDate: input.proposedEndDate,
        proposedValue: input.proposedValue,
        proposedChanges: { reason: input.reason },
        priority: renewalPriority(date!.days),
      })
      .returning();
    await notifyRenewal(tx, contract, req.user.id, "renewal_request", input.reason);
    await contractService.record(tx, req, contract, "renewal-request", null, created);
    return publicRenewal(created!);
  });
}

export async function processRenewal(
  req: FastifyRequest,
  id: string,
  action: RenewalAction,
  input: { response?: string },
) {
  return db.transaction(async (tx) => {
    // Lock the original first everywhere to keep a consistent lock order.
    const [found] = await tx.select().from(renewals).where(eq(renewals.id, id));
    if (!found) throw contractService.notFound();
    const contract = await contractService.getContract(tx, found.originalContractId, true);
    const [renewal] = await tx.select().from(renewals).where(eq(renewals.id, id)).for("update");
    if (!renewal) throw contractService.notFound();
    if (
      action === "cancel"
        ? renewal.requestedBy !== req.user.id
        : !(["admin", "supervisor"].includes(req.user.role) || contract.createdBy === req.user.id)
    )
      throw contractService.forbidden();
    if (renewal.status !== "pending")
      throw contractService.conflict("La renovación ya fue procesada.");
    if (
      action !== "cancel" &&
      req.user.role !== "admin" &&
      renewal.originalRequestedBy === req.user.id
    )
      throw contractService.forbidden();
    let childId: string | null = null;
    if (action === "approve") {
      if (!["active", "expiring_soon", "expired"].includes(contract.status))
        throw contractService.conflict();
      childId = await createRenewalChild(tx, req, contract, renewal);
    }
    const [updated] = await tx
      .update(renewals)
      .set({
        status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "cancelled",
        processedBy: req.user.id,
        processedAt: new Date(),
        gestorResponse: input.response,
        newContractId: childId,
      })
      .where(eq(renewals.id, id))
      .returning();
    const auditAction =
      action === "approve" && renewal.originalRequestedBy === req.user.id
        ? "renewal-approved_own"
        : "renewal-" + action;
    await contractService.record(tx, req, contract, auditAction, renewal, updated);
    await notifyRenewal(
      tx,
      contract,
      renewal.requestedBy,
      action === "approve" ? "renewal_approved" : "renewal_rejected",
      "Renovación: " + action + (input.response ? ". " + input.response : ""),
    );
    return publicRenewal(updated!);
  });
}

async function createRenewalChild(
  tx: Transaction,
  req: FastifyRequest,
  contract: contractService.Contract,
  renewal: typeof renewals.$inferSelect,
) {
  const values = { ...(contract.variablesData as Record<string, unknown>) };
  for (const [name, value] of Object.entries({
    fecha_inicio: renewal.proposedStartDate,
    fecha_fin: renewal.proposedEndDate,
    valor_contrato: renewal.proposedValue,
  }))
    if (name in values) values[name] = value;
  const definitions = await historicalDefinitions(tx, contract);
  const generatedContent = await contractService.prepareContent(
    tx,
    contract.content,
    values,
    true,
    definitions,
    contract.contentFormat,
  );
  const [child] = await tx
    .insert(contracts)
    .values({
      templateId: contract.templateId,
      title: contract.title,
      content: contract.content,
      contentFormat: contract.contentFormat,
      generatedContent,
      variablesData: values,
      contractValue: renewal.proposedValue,
      currency: contract.currency,
      startDate: renewal.proposedStartDate,
      endDate: renewal.proposedEndDate,
      parentContractId: contract.id,
      renewalType: "manual_renewal",
      createdBy: contract.createdBy,
      originalCreatedBy: renewal.originalRequestedBy,
      clientName: contract.clientName,
      clientEmail: contract.clientEmail,
      clientPhone: contract.clientPhone,
      notes: contract.notes,
    })
    .returning();
  const childId = child!.id;
  const signatories = await contractService.getSignatories(tx, contract.id);
  if (signatories.length)
    await tx.insert(contractSignatories).values(
      signatories.map((signer) => ({
        contractId: childId!,
        name: signer.name,
        email: signer.email,
        phone: signer.phone,
        cedula: signer.cedula,
        userId: signer.userId,
        role: signer.role,
        roleLabel: signer.roleLabel,
        slotIndex: signer.slotIndex,
        signingOrder: signer.signingOrder,
      })),
    );
  await contractService.snapshot(tx, child!, req.user, "Renovación manual", definitions);
  await contractService.record(tx, req, child!, "renewal-child", null, {
    parentContractId: contract.id,
  });
  return childId;
}
