import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "../../lib/errors.js";

export function aggregateIpLimit(app: FastifyInstance, max: number) {
  const limit = app.createRateLimit({ max, timeWindow: "1 minute" });
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await limit(request);
    if (result.isAllowed || !result.isExceeded) return;
    reply.header("Retry-After", result.ttlInSeconds);
    throw new ApiError(429, "RATE_LIMITED", "Demasiados intentos. Inténtalo más tarde.");
  };
}
