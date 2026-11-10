import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Role } from "../db/schema.js";
import { sessionUser } from "../lib/auth/sessions.js";
import { verifyAccessToken } from "../lib/auth/jwt.js";
import { ApiError, unauthorized } from "../lib/errors.js";
import { publicUser, type PublicUser } from "../modules/users/schemas.js";
declare module "fastify" {
  interface FastifyRequest {
    user: PublicUser;
    sessionId?: string;
    credentialsVersion: number;
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
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    typeof payload.sub !== "string" ||
    !uuid.test(payload.sub) ||
    typeof payload.sid !== "string" ||
    !uuid.test(payload.sid) ||
    typeof payload.role !== "string" ||
    typeof payload.cv !== "number" ||
    !Number.isSafeInteger(payload.cv) ||
    payload.cv < 0
  )
    throw unauthorized();
  const user = await sessionUser({
    userId: payload.sub,
    sessionId: payload.sid,
    role: payload.role,
    credentialsVersion: payload.cv,
  });
  if (!user) throw unauthorized();
  const path = request.routeOptions.url;
  if (
    user.mustChangePassword &&
    !(request.method === "PATCH" && path === "/api/v1/me/password") &&
    !(request.method === "POST" && path === "/api/v1/auth/logout")
  )
    throw new ApiError(
      403,
      "PASSWORD_CHANGE_REQUIRED",
      "Debes cambiar tu contraseña temporal antes de continuar.",
    );
  request.user = publicUser(user);
  request.sessionId = payload.sid;
  request.credentialsVersion = payload.cv;
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
  app.decorateRequest("credentialsVersion");
}
