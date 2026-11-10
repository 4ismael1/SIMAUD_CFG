import { normalizeTemplateValues } from "../../lib/validation/template-values.js";
import { addNotification, notificationLink } from "../notifications/service.js";
import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import {
  contracts,
  contractSignatories as signatories,
  contractVersions as versions,
  users,
} from "../../db/schema.js";
import { ApiError } from "../../lib/errors.js";
import { audit } from "../../lib/audit.js";
import { enqueueMail } from "../../lib/mail/outbox.js";
import type { MailTemplate } from "../../lib/mail/templates/index.js";
import { generatedContent, contentVariables } from "../../lib/rich-doc/content.js";
import type { ContentFormat } from "../../lib/rich-doc/types.js";
import {
  linkInvitations,
  normalizeEmail,
  resolveSignatoryUser,
  duplicateSignatory,
} from "./identities.js";
import { captureDefinitions, type VariableDefinition } from "./variable-history.js";
import { canReview } from "./review-permissions.js";
import { lockContractRows } from "./contract-locks.js";
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
  const rows = lock
    ? await lockContractRows(tx, [id])
    : await tx.select().from(contracts).where(eq(contracts.id, id));
  const contract = rows.find((row) => row.id === id);
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
export function permissions(
  contract: Contract,
  actor: Actor,
  signatories: Signatory[],
  requestedBy?: string | null,
) {
  const own = contract.createdBy === actor.id;
  const editor = actor.role === "admin" || (actor.role === "gestor" && own);
  const editable = ["draft", "rejected"].includes(contract.status);
  const reviewer =
    canReview(contract, actor, requestedBy) && contract.status === "pending_approval";
  const me = signatories.find((item) => item.userId === actor.id);
  return {
    edit:
      editor &&
      editable &&
      !contract.signedPdfPath &&
      !contract.signedPdfSha256 &&
      !contract.systemSeal &&
      !contract.activatedAt,
    submit: editor && editable,
    approve: reviewer,
    reject: reviewer,
    sign:
      contract.status === "pending_signatures" &&
      !!me &&
      me.status === "pending" &&
      signatories.every((item) => item.signingOrder >= me.signingOrder || item.status === "signed"),
    adjustSignature:
      contract.status === "pending_signatures" &&
      !contract.activatedAt &&
      !contract.signedPdfPath &&
      !contract.systemSeal &&
      me?.status === "signed",
    cancel:
      canManage(contract, actor) &&
      ["pending_signatures", "active", "expiring_soon"].includes(contract.status),
    archive: canManage(contract, actor),
    delete:
      editor &&
      editable &&
      !contract.everSigned &&
      !contract.signedPdfPath &&
      !contract.signedPdfSha256 &&
      !contract.systemSeal &&
      !contract.activatedAt &&
      !contract.evidenceCount &&
      !signatories.some(
        (signer) => signer.status === "signed" || signer.signedAt || signer.signaturePath,
      ),
    override: actor.role === "admin",
  };
}
export async function linkSignatories(tx: Transaction, actor: Actor, contractId?: string) {
  await linkInvitations(tx, actor, contractId);
}
export async function prepareContent(
  tx: Transaction,
  content: string,
  values: Record<string, unknown>,
  validateValues = true,
  definitions?: VariableDefinition[],
  format: ContentFormat = "plain",
) {
  const defs = definitions ?? (await captureDefinitions(tx, content, format));
  const names = contentVariables(content, format);
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
  return generatedContent(content, format, values, defs);
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
  if (new Set(input.map((item) => normalizeEmail(item.email))).size !== input.length)
    throw duplicateSignatory();
  const old = await getSignatories(tx, contractId);
  await tx.update(signatories).set({ userId: null }).where(eq(signatories.contractId, contractId));
  const kept = new Set<string>();
  const linked = new Set<string>();
  for (const item of input) {
    const email = normalizeEmail(item.email);
    const prior = old.find(
      (signer) => !kept.has(signer.id) && normalizeEmail(signer.email) === email,
    );
    const userId = await resolveSignatoryUser(tx, email, item.cedula);
    if (userId && linked.has(userId)) throw duplicateSignatory();
    if (userId) linked.add(userId);
    if (prior) {
      kept.add(prior.id);
      await tx
        .update(signatories)
        .set({
          ...item,
          email,
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
        .values({ ...item, email, contractId: contractId, userId })
        .returning();
      kept.add(added!.id);
    }
  }
  for (const signer of old)
    if (!kept.has(signer.id)) await tx.delete(signatories).where(eq(signatories.id, signer.id));
}
export async function snapshot(
  tx: Transaction,
  contract: Contract,
  actor: Actor,
  summary: string,
  definitions?: VariableDefinition[],
) {
  const signer = await getSignatories(tx, contract.id);
  await tx.insert(versions).values({
    contractId: contract.id,
    versionNumber: contract.currentVersion,
    content: contract.content,
    contentFormat: contract.contentFormat,
    generatedContent: contract.generatedContent,
    variablesData: contract.variablesData,
    createdBy: actor.id,
    changeSummary: summary,
    snapshot: {
      variableDefinitions:
        definitions ?? (await captureDefinitions(tx, contract.content, contract.contentFormat)),
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
export { decorate } from "./decoration.js";
