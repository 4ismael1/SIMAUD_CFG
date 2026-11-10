import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { Transaction } from "../../db/client.js";
import { adminAuditLogs, users } from "../../db/schema.js";
import { audit as auditLegacy, type AuditEntry } from "../../lib/audit.js";

export type AuditActor = { actorId: string; ip?: string };
export const auditActor = (request: FastifyRequest): AuditActor => ({
  actorId: request.user.id,
  ip: request.ip,
});
type AdminEntry = Pick<
  typeof adminAuditLogs.$inferInsert,
  "area" | "action" | "targetType" | "targetId" | "targetLabel"
> & {
  details?: {
    fields?: string[];
    previousRole?: string;
    role?: string;
    isActive?: boolean;
    driver?: string;
    pendingMigration?: boolean;
    jobId?: string;
  };
};

export async function auditAdmin(tx: Transaction, actor: AuditActor, entry: AdminEntry) {
  const [user] = await tx
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, actor.actorId));
  await tx.insert(adminAuditLogs).values({
    ...entry,
    actorId: actor.actorId,
    actorName: user?.name ?? "Usuario eliminado",
    ip: actor.ip,
  });
}

export async function auditStorage(tx: Transaction, entry: AuditEntry) {
  const [actor] = entry.userId
    ? await tx.select({ name: users.name }).from(users).where(eq(users.id, entry.userId))
    : [];
  // Only operational metadata is copied; storage configuration can contain credentials.
  const values = entry.newValues as Record<string, unknown> | null | undefined;
  const details = {
    ...(typeof values?.driver === "string" ? { driver: values.driver } : {}),
    ...(typeof values?.pendingMigration === "boolean"
      ? { pendingMigration: values.pendingMigration }
      : {}),
    ...(typeof values?.jobId === "string" ? { jobId: values.jobId } : {}),
  };
  const oldValues = entry.oldValues as Record<string, unknown> | null | undefined;
  // Preserve T11's existing operational history while adding the global administration chain.
  await auditLegacy(tx, {
    ...entry,
    oldValues: typeof oldValues?.driver === "string" ? { driver: oldValues.driver } : null,
    newValues: details,
  });
  await tx.insert(adminAuditLogs).values({
    actorId: entry.userId,
    actorName: actor?.name ?? "Sistema",
    ip: entry.ip,
    area: "storage",
    action: entry.action,
    targetType: "storage",
    targetId: "system",
    targetLabel: "Almacenamiento del sistema",
    details,
  });
}
