import { normalizeTemplateValues } from "../../lib/validation/template-values.js";
import { addNotification, notificationLink } from "../notifications/service.js";
import type { FastifyRequest } from "fastify";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import {
  contracts,
  contractTemplates,
  contractSignatories as signatories,
  contractVersions as versions,
  users,
  notifications,
} from "../../db/schema.js";
import { ApiError } from "../../lib/errors.js";
import { audit } from "../../lib/audit.js";
import { enqueueMail } from "../../lib/mail/outbox.js";
import type { MailTemplate } from "../../lib/mail/templates/index.js";
import { renderTemplate } from "../../lib/render-template.js";
import { resolveVariables } from "./catalog.js";
export type Contract = typeof contracts.$inferSelect;
export type Signatory = typeof signatories.$inferSelect;
export type Actor = FastifyRequest["user"];
export const notFound = () => new ApiError(404, "NOT_FOUND", "No se encontró el contrato.");
export const forbidden = () =>
  new ApiError(403, "FORBIDDEN", "No tienes permisos para realizar esta acción.");
export const conflict = (message = "La operación no está permitida en el estado actual.") =>
  new ApiError(409, "CONFLICT", message);
export const invalid = (message: string, details?: unknown) =>
  new ApiError(400, "VALIDATION_ERROR", message, details);
export async function getContract(tx: Transaction | typeof db, id: string, lock = false) {
  const query = tx.select().from(contracts).where(eq(contracts.id, id));
  const [contract] = await (lock ? query.for("update") : query);
  if (!contract) throw notFound();
  return contract;
}
export async function getSignatories(tx: Transaction | typeof db, id: string) {
  return tx
    .select()
    .from(signatories)
    .where(eq(signatories.contractId, id))
    .orderBy(signatories.signingOrder, signatories.id);
}
export function canRead(contract: Contract, actor: Actor, signatories: Signatory[]) {
  return (
    ["admin", "supervisor"].includes(actor.role) ||
    (actor.role === "gestor" && contract.createdBy === actor.id) ||
    signatories.some((item) => item.userId === actor.id)
  );
}
export function canManage(contract: Contract, actor: Actor) {
  return (
    ["admin", "supervisor"].includes(actor.role) ||
    (actor.role === "gestor" && contract.createdBy === actor.id)
  );
}
export function permissions(contract: Contract, actor: Actor, signatories: Signatory[]) {
  const own = contract.createdBy === actor.id;
  const editor = actor.role === "admin" || (actor.role === "gestor" && own);
  const editable = ["draft", "rejected"].includes(contract.status);
  const reviewer =
    (actor.role === "admin" || (actor.role === "supervisor" && !own)) &&
    contract.status === "pending_approval";
  const me = signatories.find((item) => item.userId === actor.id);
  return {
    edit: editor && editable,
    submit: editor && editable,
    approve: reviewer,
    reject: reviewer,
    sign:
      contract.status === "pending_signatures" &&
      !!me &&
      me.status === "pending" &&
      signatories.every((item) => item.signingOrder >= me.signingOrder || item.status === "signed"),
    cancel:
      canManage(contract, actor) &&
      ["pending_signatures", "active", "expiring_soon"].includes(contract.status),
    archive: canManage(contract, actor),
    delete:
      actor.role === "admin" || (actor.role === "gestor" && own && contract.status === "draft"),
    override: actor.role === "admin",
  };
}
export async function linkSignatories(tx: Transaction, actor: Actor) {
  // Only confirmed, authenticated identities reach this function. Never take an existing binding.
  await tx
    .update(signatories)
    .set({ userId: actor.id })
    .where(
      and(
        isNull(signatories.userId),
        or(
          eq(signatories.email, actor.email),
          actor.cedula ? eq(signatories.cedula, actor.cedula) : undefined,
        ),
      ),
    );
}
export async function prepareContent(
  tx: Transaction,
  content: string,
  values: Record<string, unknown>,
  validateValues = true,
) {
  const { defs, names } = await resolveVariables(tx, content);
  const unknown = Object.keys(values).filter((versionNumber) => !names.includes(versionNumber));
  if (unknown.length) throw invalid("Variables desconocidas.", { unknown });
  const missing = defs
    .filter(
      (item) =>
        item.required &&
        (values[item.name] === undefined || values[item.name] === null || values[item.name] === ""),
    )
    .map((item) => item.name);
  if (missing.length) throw invalid("Faltan variables requeridas.", { missing });
  if (validateValues) Object.assign(values, normalizeTemplateValues(values, defs));
  return renderTemplate(content, values, defs).html;
}
export async function reconcileSignatories(
  tx: Transaction,
  contractId: string,
  input: {
    name: string;
    email: string;
    phone?: string;
    cedula?: string;
    role: Signatory["role"];
    signingOrder: number;
  }[],
) {
  const old = await getSignatories(tx, contractId);
  const kept = new Set<string>();
  const linked = new Set<string>();
  for (const item of input) {
    const matches = await tx
      .select()
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          isNull(users.deletedAt),
          or(eq(users.email, item.email), item.cedula ? eq(users.cedula, item.cedula) : undefined),
        ),
      );
    if (matches.length > 1) throw invalid("Email y cédula pertenecen a usuarios distintos.");
    const prior = old.find(
      (signatories) =>
        !kept.has(signatories.id) &&
        (signatories.email === item.email || (!!item.cedula && signatories.cedula === item.cedula)),
    );
    const userId = prior?.userId ?? matches[0]?.id ?? null;
    if (userId && linked.has(userId))
      throw invalid("Un usuario no puede aparecer dos veces como firmante.");
    if (userId) linked.add(userId);
    if (prior) {
      kept.add(prior.id);
      await tx
        .update(signatories)
        .set({
          ...item,
          userId,
          status: "pending",
          signedAt: null,
          signaturePath: null,
          viewedAt: null,
          acceptedDeclarationAt: null,
          ip: null,
          userAgent: null,
        })
        .where(eq(signatories.id, prior.id));
    } else {
      const [added] = await tx
        .insert(signatories)
        .values({ ...item, contractId: contractId, userId })
        .returning();
      kept.add(added!.id);
    }
  }
  for (const signer of old)
    if (!kept.has(signer.id)) await tx.delete(signatories).where(eq(signatories.id, signer.id));
}
export async function snapshot(tx: Transaction, contract: Contract, actor: Actor, summary: string) {
  const signer = await getSignatories(tx, contract.id);
  await tx.insert(versions).values({
    contractId: contract.id,
    versionNumber: contract.currentVersion,
    content: contract.content,
    generatedContent: contract.generatedContent,
    variablesData: contract.variablesData,
    createdBy: actor.id,
    changeSummary: summary,
    snapshot: {
      title: contract.title,
      value: contract.contractValue,
      startDate: contract.startDate,
      endDate: contract.endDate,
      notes: contract.notes,
      signatories: signer.map((item) => ({
        id: item.id,
        userId: item.userId,
        name: item.name,
        email: item.email,
        phone: item.phone,
        cedula: item.cedula,
        role: item.role,
        signingOrder: item.signingOrder,
      })),
    },
  });
}
export async function record(
  tx: Transaction,
  req: FastifyRequest,
  contract: Contract,
  action: string,
  old: unknown,
  next: unknown,
) {
  await audit(tx, {
    contractId: contract.id,
    entityType: "contract",
    entityId: contract.id,
    action,
    oldValues: old,
    newValues: next,
    userId: req.user.id,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });
}
export async function notify(
  tx: Transaction,
  contract: Contract,
  type: string,
  recipients: { userId: string | null; email?: string }[],
  message: string,
) {
  const seen = new Set<string>();
  for (const r of recipients) {
    const key = r.userId ?? r.email;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    let email = r.email;
    if (r.userId) {
      const [u] = await tx
        .select({
          email: users.email,
          isActive: users.isActive,
          deletedAt: users.deletedAt,
        })
        .from(users)
        .where(eq(users.id, r.userId));
      if (!u?.isActive || u.deletedAt) continue;
      email = u.email;
      await addNotification(tx, {
        userId: r.userId,
        type,
        title: contract.title,
        message,
        data: { contractId: contract.id, code: contract.code },
        actionUrl: notificationLink(type, contract.id),
      });
    }
    if (!r.userId && email)
      await enqueueMail(tx, email, "SIMAUD: " + contract.code, type as MailTemplate, {
        message,
        contractId: contract.id,
      });
  }
}
export async function nextSigners(tx: Transaction, contract: Contract) {
  const pending = (await getSignatories(tx, contract.id)).filter(
    (signatories) => signatories.status !== "signed",
  );
  if (pending.length)
    await notify(
      tx,
      contract,
      "signature_required",
      pending.filter((signatories) => signatories.signingOrder === pending[0]!.signingOrder),
      "Tu firma es requerida.",
    );
}
export async function decorate(tx: Transaction | typeof db, contract: Contract) {
  const signer = await getSignatories(tx, contract.id);
  const [template] = contract.templateId
    ? await tx
        .select({ id: contractTemplates.id, title: contractTemplates.title })
        .from(contractTemplates)
        .where(eq(contractTemplates.id, contract.templateId))
    : [];
  const [creator] = contract.createdBy
    ? await tx
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, contract.createdBy))
    : [];
  return {
    ...contract,
    template: template ?? null,
    creator: creator ?? null,
    signatures: {
      signed: signer.filter((item) => item.status === "signed").length,
      total: signer.length,
    },
    daysToExpiry: contract.endDate
      ? Math.ceil(
          (Date.parse(contract.endDate + "T00:00:00Z") -
            Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z")) /
            86400000,
        )
      : null,
  };
}
