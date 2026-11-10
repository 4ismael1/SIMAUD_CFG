import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "../../lib/errors.js";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../../db/client.js";

export async function consumeIdentityBudget(
  identity: string,
  purpose: string,
  max: number,
  now = new Date(),
) {
  const key = createHash("sha256")
    .update(purpose + ":" + identity.trim().toLowerCase())
    .digest("hex");
  const expires = new Date(now.getTime() + 60000);
  const result = await db.execute<{ attempts: number; expires: string }>(sql`
    insert into auth_request_budgets (key, attempts, expires_at) values (${key}, 1, ${expires})
    on conflict (key) do update set
      attempts = case when auth_request_budgets.expires_at <= ${now} then 1 else auth_request_budgets.attempts + 1 end,
      expires_at = case when auth_request_budgets.expires_at <= ${now} then ${expires} else auth_request_budgets.expires_at end
    returning attempts, expires_at as expires
  `);
  await db.execute(sql`delete from auth_request_budgets where expires_at <= ${now}`);
  const row = result.rows[0]!;
  return {
    allowed: row.attempts <= max,
    retryAfter: Math.max(1, Math.ceil((new Date(row.expires).getTime() - now.getTime()) / 1000)),
  };
}

export function identityLimit(
  purpose: string,
  max: number,
  identity: (request: FastifyRequest) => string,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await consumeIdentityBudget(identity(request), purpose, max);
    if (result.allowed) return;
    reply.header("Retry-After", result.retryAfter);
    throw new ApiError(429, "RATE_LIMITED", "Demasiados intentos. Inténtalo más tarde.");
  };
}

export function aggregateIpLimit(app: FastifyInstance, max: number) {
  const limit = app.createRateLimit({ max, timeWindow: "1 minute" });
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await limit(request);
    if (result.isAllowed || !result.isExceeded) return;
    reply.header("Retry-After", result.ttlInSeconds);
    throw new ApiError(429, "RATE_LIMITED", "Demasiados intentos. Inténtalo más tarde.");
  };
}
