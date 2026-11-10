import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Transaction } from "../../db/client.js";
import { users, contractSignatories as signatories } from "../../db/schema.js";
import { ApiError } from "../../lib/errors.js";
import type { Actor } from "./service.js";
import { lockContractRows } from "./contract-locks.js";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function linkInvitations(tx: Transaction, actor: Actor, contractId?: string) {
  const contractIds = contractId ? [contractId] : await invitationContractIds(tx, actor.email);
  if (!contractIds.length) return;
  if (!contractId) await lockContractRows(tx, contractIds);
  // Serializes lazy binding for the same account, including simultaneous inbox requests.
  const [user] = await tx.select().from(users).where(eq(users.id, actor.id)).for("update");
  if (!user?.emailConfirmedAt || !user.isActive || user.deletedAt) return;
  const candidates = await tx
    .select()
    .from(signatories)
    .where(
      and(
        isNull(signatories.userId),
        inArray(signatories.contractId, contractIds),
        sql`not exists (select 1 from contract_signatory_binding_review r where r.signatory_id = ${signatories.id} and r.resolved_at is null)`,
        sql`lower(btrim(${signatories.email})) = ${normalizeEmail(user.email)}`,
      ),
    )
    .orderBy(signatories.contractId, signatories.id)
    .for("update");
  for (const candidate of candidates) {
    const [existing] = await tx
      .select({ id: signatories.id })
      .from(signatories)
      .where(
        and(eq(signatories.contractId, candidate.contractId), eq(signatories.userId, user.id)),
      );
    if (existing) continue;
    await tx.update(signatories).set({ userId: user.id }).where(eq(signatories.id, candidate.id));
  }
}

async function invitationContractIds(tx: Transaction, email: string) {
  const candidates = await tx
    .selectDistinct({ id: signatories.contractId })
    .from(signatories)
    .where(
      and(
        isNull(signatories.userId),
        sql`lower(btrim(${signatories.email})) = ${normalizeEmail(email)}`,
      ),
    );
  return candidates.map((candidate) => candidate.id);
}

export async function resolveSignatoryUser(tx: Transaction, email: string, cedula?: string) {
  if (!cedula) return null;
  const matches = await tx
    .select()
    .from(users)
    .where(
      and(
        or(sql`lower(btrim(${users.email})) = ${normalizeEmail(email)}`, eq(users.cedula, cedula)),
        eq(users.isActive, true),
        isNull(users.deletedAt),
      ),
    );
  if (matches.length > 1)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Email y c\u00e9dula pertenecen a usuarios distintos.",
    );
  const user = matches[0];
  return user?.emailConfirmedAt &&
    normalizeEmail(user.email) === normalizeEmail(email) &&
    user.cedula === cedula
    ? user.id
    : null;
}

export function duplicateSignatory() {
  return new ApiError(
    400,
    "VALIDATION_ERROR",
    "Un usuario no puede aparecer dos veces como firmante.",
  );
}
