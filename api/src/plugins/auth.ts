import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, type Role } from "../db/schema.js";
import { verifyAccessToken } from "../lib/auth/jwt.js";
import { ApiError, unauthorized } from "../lib/errors.js";
import { publicUser, type PublicUser } from "../modules/users/schemas.js";
declare module "fastify" {
  interface FastifyRequest {
    user: PublicUser;
    sessionId?: string;
  }
}
export async function authenticate(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();
  let payload;
  try {
    payload = await verifyAccessToken(header.slice(7));
  } catch {
    throw unauthorized();
  }
  if (typeof payload.sub !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.sub))
    throw unauthorized();
  const [user] = await db.select().from(users).where(eq(users.id, payload.sub));
  if (
    !user ||
    !user.isActive ||
    user.deletedAt ||
    !user.emailConfirmedAt ||
    user.role !== payload.role
  )
    throw unauthorized();
  request.user = publicUser(user);
  request.sessionId = typeof payload.sid === "string" ? payload.sid : undefined;
}
export const requireRole =
  (...roles: Role[]) =>
  async (request: FastifyRequest) => {
    await authenticate(request);
    if (!roles.includes(request.user.role))
      throw new ApiError(403, "FORBIDDEN", "No tienes permisos para realizar esta acción.");
  };
export function installAuth(app: FastifyInstance) {
  app.decorateRequest("user");
  app.decorateRequest("sessionId");
}
