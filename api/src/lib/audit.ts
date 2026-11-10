import type { Transaction } from "../db/client.js";
import { contractAuditLogs } from "../db/schema.js";
export type AuditEntry = Pick<
  typeof contractAuditLogs.$inferInsert,
  | "userId"
  | "action"
  | "entityType"
  | "entityId"
  | "oldValues"
  | "newValues"
  | "ip"
  | "userAgent"
  | "contractId"
>;
export async function audit(tx: Transaction, entry: AuditEntry) {
  await tx.insert(contractAuditLogs).values(entry);
}
