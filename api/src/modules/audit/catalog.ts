import type { FastifyRequest } from "fastify";
import type { Transaction } from "../../db/client.js";
import { auditActor, auditAdmin } from "./service.js";

export async function auditCatalog(
  tx: Transaction,
  request: FastifyRequest,
  area: "templates" | "variables",
  action: string,
  target: { id: string; title?: string; label?: string },
  fields?: string[],
) {
  await auditAdmin(tx, auditActor(request), {
    area,
    action,
    targetType: area === "templates" ? "template" : "variable",
    targetId: target.id,
    targetLabel: target.title ?? target.label ?? "Catálogo",
    details: { fields },
  });
}
