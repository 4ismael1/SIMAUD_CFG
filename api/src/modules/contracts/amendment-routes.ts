import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../plugins/auth.js";
import { parse, uuid } from "./schemas.js";
import { createAmendment } from "./amendments.js";
import { resetSignatures } from "./signature-reset.js";

const reasonInput = z.strictObject({ reason: z.string().trim().min(1).max(500) });
export async function amendmentRoutes(app: FastifyInstance) {
  const auth = { preHandler: authenticate };
  app.post("/contracts/:id/amendments", auth, async (req, reply) => {
    const { id } = parse(z.strictObject({ id: uuid }), req.params);
    const { reason } = parse(reasonInput, req.body);
    return reply.code(201).send(await createAmendment(req, id, reason));
  });
  app.post("/contracts/:id/signatures/reset", auth, async (req) => {
    const { id } = parse(z.strictObject({ id: uuid }), req.params);
    const { reason } = parse(reasonInput, req.body);
    return resetSignatures(req, id, reason);
  });
  app.post("/contracts/:id/signatures/:signatoryId/reset", auth, async (req) => {
    const { id, signatoryId } = parse(z.strictObject({ id: uuid, signatoryId: uuid }), req.params);
    const { reason } = parse(reasonInput, req.body);
    return resetSignatures(req, id, reason, signatoryId);
  });
}
