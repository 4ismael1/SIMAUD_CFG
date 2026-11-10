import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { contracts, users } from "../../db/schema.js";
import { ApiError } from "../../lib/errors.js";
import { applyContractAction } from "./actions.js";
import * as service from "./service.js";

export function canReassign(contract: service.Contract, actor: service.Actor) {
  return (
    actor.role === "admin" &&
    !contract.archived &&
    !["cancelled", "renewed"].includes(contract.status)
  );
}

export async function reassignContract(
  req: FastifyRequest,
  id: string,
  input: { managerId: string; reason: string },
) {
  if (req.user.role !== "admin") throw service.forbidden();
  await db.transaction(async (tx) => {
    const contract = await service.getContract(tx, id, true);
    if (!canReassign(contract, req.user)) throw service.conflict();
    const [manager] = await tx
      .select()
      .from(users)
      .where(eq(users.id, input.managerId))
      .for("share");
    if (
      !manager ||
      !manager.isActive ||
      manager.deletedAt ||
      !["admin", "gestor"].includes(manager.role)
    )
      throw service.invalid("El destino debe ser un gestor o administrador activo.");
    if (contract.createdBy === manager.id)
      throw service.conflict("El contrato ya pertenece a ese gestor.");
    await tx
      .update(contracts)
      .set({ createdBy: manager.id, updatedAt: new Date() })
      .where(eq(contracts.id, id));
    await service.record(
      tx,
      req,
      contract,
      "manager_reassigned",
      { managerId: contract.createdBy },
      { managerId: manager.id, reason: input.reason },
    );
    // The existing notification constraint has no reassignment category; keep the current schema.
    await service.notify(
      tx,
      contract,
      "approval_result",
      [{ userId: contract.createdBy }, { userId: manager.id }],
      "Gestor responsable reasignado: " + input.reason,
    );
  });
}

type BulkInput = { action: "cancel" | "archive" | "unarchive"; ids: string[]; reason?: string };
type BulkResult = {
  id: string;
  code: string | null;
  ok: boolean;
  error?: { code: string; message: string };
};

async function applyBulkItem(
  req: FastifyRequest,
  input: BulkInput,
  id: string,
): Promise<BulkResult> {
  let code: string | null = null;
  try {
    return await db.transaction(async (tx) => {
      const contract = await service.getContract(tx, id, true);
      code = contract.code;
      const allSignatories = await service.getSignatories(tx, id);
      // Bulk exposes a free-text reason; the individual action requires a category and description.
      const body =
        input.action === "cancel"
          ? { reason: "other", description: input.reason }
          : { reason: input.reason };
      const actionRequest = Object.assign(Object.create(req) as FastifyRequest, { body });
      const { next, changes } = await applyContractAction({
        tx,
        req: actionRequest,
        contract,
        allSignatories,
        input: body,
        id,
        action: input.action,
      });
      const [updated] = await tx
        .update(contracts)
        .set({ ...changes, status: next, updatedAt: new Date() })
        .where(eq(contracts.id, id))
        .returning();
      await service.record(tx, req, contract, input.action, contract, { ...updated, ...body });
      return { id, code, ok: true };
    });
  } catch (error) {
    if (error instanceof ApiError)
      return { id, code, ok: false, error: { code: error.code, message: error.message } };
    req.log.error(
      { errorType: error instanceof Error ? error.name : typeof error },
      "Falló una acción masiva de contratos",
    );
    return {
      id,
      code,
      ok: false,
      error: { code: "INTERNAL", message: "No se pudo procesar el contrato." },
    };
  }
}

export async function bulkContracts(req: FastifyRequest, input: BulkInput) {
  if (req.user.role !== "admin") throw service.forbidden();
  const results: BulkResult[] = [];
  for (const id of input.ids) results.push(await applyBulkItem(req, input, id));
  const succeeded = results.filter((result) => result.ok).length;
  return { succeeded, failed: results.length - succeeded, results };
}
