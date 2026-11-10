import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "../../lib/errors.js";

export function accessLinkLimits(app: FastifyInstance) {
  const actor = app.createRateLimit({
    max: 10,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.user.id,
  });
  const target = app.createRateLimit({
    max: 3,
    timeWindow: "1 minute",
    keyGenerator: (req) => (req.params as { id: string }).id,
  });
  const enforce = async (req: FastifyRequest, reply: FastifyReply, includeTarget: boolean) => {
    for (const limit of includeTarget ? [actor, target] : [actor]) {
      const result = await limit(req);
      if (result.isAllowed || !result.isExceeded) continue;
      reply.header("Retry-After", result.ttlInSeconds);
      throw new ApiError(429, "RATE_LIMITED", "Demasiados envíos. Inténtalo más tarde.");
    }
  };
  return {
    invitation: (req: FastifyRequest, reply: FastifyReply) => enforce(req, reply, false),
    access: (req: FastifyRequest, reply: FastifyReply) => enforce(req, reply, true),
  };
}
