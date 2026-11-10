import { listEligibleRenewals, listRenewals } from "./queries.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../plugins/auth.js";
import { parse, uuid, pageInput } from "../contracts/schemas.js";
import { renewalQuerySchema, renewalInputSchema } from "./schemas.js";
import { requestRenewal, processRenewal } from "./service.js";

export { renewalPriority, activateRenewalParent } from "./service.js";

export async function renewalRoutes(app: FastifyInstance) {
  const auth = { preHandler: authenticate };
  app.get("/renewals/eligible", auth, async (req) => {
    return listEligibleRenewals(req.user, parse(pageInput, req.query));
  });
  app.get("/renewals", auth, async (req) => {
    const query = parse(renewalQuerySchema, req.query);
    return listRenewals(req.user, query);
  });
  app.post("/renewals", auth, async (req, reply) => {
    const input = parse(renewalInputSchema, req.body);
    const renewal = await requestRenewal(req, input);
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
      return processRenewal(req, id, action, input);
    });
}
