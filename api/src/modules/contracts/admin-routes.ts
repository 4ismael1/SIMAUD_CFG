import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireRole } from "../../plugins/auth.js";
import { parse, uuid, text } from "./schemas.js";
import { reassignContract, bulkContracts } from "./admin-actions.js";
import { zFreeText } from "../../lib/validation/zod.js";

const reassignInput = z.object({ managerId: uuid, reason: zFreeText(5, 500) }).strict();
export const bulkInput = z
  .object({
    action: z.enum(["cancel", "archive", "unarchive"]),
    ids: z
      .array(uuid)
      .min(1)
      .max(100)
      .refine(
        (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
        "No se permiten contratos repetidos.",
      ),
    reason: text.optional(),
  })
  .strict()
  .refine((input) => input.action !== "cancel" || !!input.reason, {
    path: ["reason"],
    message: "El motivo es obligatorio.",
  });

export async function adminContractRoutes(
  app: FastifyInstance,
  detail: (req: FastifyRequest, id: string) => Promise<unknown>,
) {
  const admin = {
    preHandler: requireRole("admin"),
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  };
  app.post("/contracts/:id/reassign", admin, async (req) => {
    const id = parse(uuid, (req.params as { id: string }).id);
    await reassignContract(req, id, parse(reassignInput, req.body));
    return detail(req, id);
  });
  app.post("/contracts/bulk", admin, (req) => bulkContracts(req, parse(bulkInput, req.body)));
}
