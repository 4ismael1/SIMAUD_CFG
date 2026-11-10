import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "../../db/client.js";
import {
  contracts,
  contractRenewals as renewals,
  contractSignatories,
  users,
  renewalStatus,
  priority,
} from "../../db/schema.js";
import { authenticate } from "../../plugins/auth.js";
import { parse, uuid, pageInput } from "../contracts/schemas.js";
import * as contractService from "../contracts/service.js";
import { addNotification } from "../notifications/service.js";
import { audit } from "../../lib/audit.js";
export function renewalPriority(days: number) {
  return days <= 15 ? "urgent" : days <= 30 ? "high" : days <= 60 ? "medium" : "low";
}
function eligibleScope(actor: contractService.Actor) {
  return sql`(${actor.role} in ('admin','supervisor') or ${contracts.createdBy}=${actor.id} or exists(select 1 from contract_signatories s where s.contract_id=${contracts.id} and s.user_id=${actor.id}))`;
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
      sql`is_active and deleted_at is null and (role in ('admin','supervisor') or id=${contract.createdBy} or id=${requester})`,
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
export async function renewalRoutes(app: FastifyInstance) {
  const auth = { preHandler: authenticate };
  app.get("/renewals/eligible", auth, async (req) => {
    return db
      .select()
      .from(contracts)
      .where(
        and(
          eligibleScope(req.user),
          sql`${contracts.status} in ('active','expiring_soon','expired') and not exists(select 1 from contract_renewals r where r.original_contract_id=${contracts.id} and (r.status='pending' or (r.status='approved' and exists(select 1 from contracts child where child.id=r.new_contract_id and child.status not in ('cancelled','renewed')))))`,
        ),
      )
      .orderBy(contracts.endDate, contracts.id);
  });
  app.get("/renewals", auth, async (req) => {
    const query = parse(
      pageInput.extend({
        status: z.enum(renewalStatus.enumValues).optional(),
        priority: z.enum(priority.enumValues).optional(),
      }),
      req.query,
    );
    const scope = sql`(${req.user.role} in ('admin','supervisor') or (${req.user.role}='gestor' and ${contracts.createdBy}=${req.user.id}) or ${renewals.requestedBy}=${req.user.id})`;
    const filter = and(
      scope,
      query.status ? eq(renewals.status, query.status) : undefined,
      query.priority ? eq(renewals.priority, query.priority) : undefined,
    );
    const rows = await db
      .select({
        renewal: renewals,
        contract: contracts,
        requester: { id: users.id, name: users.name, email: users.email },
        daysToExpiry: sql<number>`${contracts.endDate} - (now() at time zone 'America/Santo_Domingo')::date`,
        variationPercent: sql<string>`round((${renewals.proposedValue} - ${contracts.contractValue}) / nullif(${contracts.contractValue},0) * 100,2)::text`,
        total: sql<number>`count(*) over()::int`,
      })
      .from(renewals)
      .innerJoin(contracts, eq(contracts.id, renewals.originalContractId))
      .leftJoin(users, eq(users.id, renewals.requestedBy))
      .where(filter)
      .orderBy(sql`${renewals.requestedAt} desc`, renewals.id)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [count] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(renewals)
      .innerJoin(contracts, eq(contracts.id, renewals.originalContractId))
      .where(filter);
    return {
      data: rows.map((row) => ({
        ...row.renewal,
        contract: row.contract,
        requester: row.requester,
        daysToExpiry: row.daysToExpiry,
        currentValue: row.contract.contractValue,
        variationPercent: row.variationPercent,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total: count!.total },
    };
  });
  app.post("/renewals", auth, async (req, reply) => {
    const input = parse(
      z
        .object({
          contractId: uuid,
          proposedStartDate: z.iso.date(),
          proposedEndDate: z.iso.date(),
          proposedValue: z
            .union([
              z.string().regex(/^\d{1,13}(\.\d{1,2})?$/),
              z.number().nonnegative().max(9999999999999.99),
            ])
            .transform(String),
          reason: z.string().trim().min(1).max(5000),
        })
        .strict(),
      req.body,
    );
    const renewal = await db.transaction(async (tx) => {
      await contractService.linkSignatories(tx, req.user);
      const contract = await contractService.getContract(tx, input.contractId, true);
      const signatories = await contractService.getSignatories(tx, contract.id);
      if (!contractService.canRead(contract, req.user, signatories))
        throw contractService.notFound();
      if (!["active", "expiring_soon", "expired"].includes(contract.status))
        throw contractService.conflict();
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
          sql`original_contract_id=${contract.id} and (status='pending' or (status='approved' and exists(select 1 from contracts c where c.id=new_contract_id and c.status not in ('cancelled','renewed'))))`,
        );
      if (existing.length) throw contractService.conflict("Ya hay una renovación en curso.");
      const [date] = await tx
        .execute<{ days: number }>(
          sql`select ${contract.endDate}::date - (now() at time zone 'America/Santo_Domingo')::date as days`,
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
      return created;
    });
    return reply.code(201).send(renewal);
  });
  for (const action of ["approve", "reject", "cancel"] as const)
    app.post("/renewals/:id/" + action, auth, async (req) => {
      const id = parse(uuid, (req.params as { id: string }).id);
      const input = parse(
        z
          .object({
            response:
              action === "reject"
                ? z.string().trim().min(1).max(5000)
                : z.string().trim().max(5000).optional(),
          })
          .strict(),
        req.body ?? {},
      );
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
            : !(
                ["admin", "supervisor"].includes(req.user.role) ||
                contract.createdBy === req.user.id
              )
        )
          throw contractService.forbidden();
        if (renewal.status !== "pending")
          throw contractService.conflict("La renovación ya fue procesada.");
        let childId: string | null = null;
        if (action === "approve") {
          if (!["active", "expiring_soon", "expired"].includes(contract.status))
            throw contractService.conflict();
          const values = { ...(contract.variablesData as Record<string, unknown>) };
          for (const [name, value] of Object.entries({
            fecha_inicio: renewal.proposedStartDate,
            fecha_fin: renewal.proposedEndDate,
            valor_contrato: renewal.proposedValue,
          }))
            if (name in values) values[name] = value;
          const generatedContent = await contractService.prepareContent(
            tx,
            contract.content,
            values,
          );
          const [child] = await tx
            .insert(contracts)
            .values({
              templateId: contract.templateId,
              title: contract.title,
              content: contract.content,
              generatedContent,
              variablesData: values,
              contractValue: renewal.proposedValue,
              currency: contract.currency,
              startDate: renewal.proposedStartDate,
              endDate: renewal.proposedEndDate,
              parentContractId: contract.id,
              renewalType: "manual_renewal",
              createdBy: contract.createdBy,
              clientName: contract.clientName,
              clientEmail: contract.clientEmail,
              clientPhone: contract.clientPhone,
              notes: contract.notes,
            })
            .returning();
          childId = child!.id;
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
                signingOrder: signer.signingOrder,
              })),
            );
          await contractService.snapshot(tx, child!, req.user, "Renovación manual");
          await contractService.record(tx, req, child!, "renewal-child", null, {
            parentContractId: contract.id,
          });
        }
        const [updated] = await tx
          .update(renewals)
          .set({
            status:
              action === "approve" ? "approved" : action === "reject" ? "rejected" : "cancelled",
            processedBy: req.user.id,
            processedAt: new Date(),
            gestorResponse: input.response,
            newContractId: childId,
          })
          .where(eq(renewals.id, id))
          .returning();
        await contractService.record(tx, req, contract, "renewal-" + action, renewal, updated);
        await notifyRenewal(
          tx,
          contract,
          renewal.requestedBy,
          action === "approve" ? "renewal_approved" : "renewal_rejected",
          "Renovación: " + action + (input.response ? ". " + input.response : ""),
        );
        return updated;
      });
    });
}
