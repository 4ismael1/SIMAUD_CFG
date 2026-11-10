import { SignJWT, jwtVerify } from "jose";
import { env } from "../../config/env.js";
import type { Role } from "../../db/schema.js";
const key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
export const createAccessToken = (
  user: { id: string; role: Role; credentialsVersion?: number },
  sessionId?: string,
) =>
  new SignJWT({ role: user.role, sid: sessionId, cv: user.credentialsVersion ?? 0 })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer("simaud-api")
    .setAudience("simaud-web")
    .setExpirationTime("15m")
    .sign(key);
export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["HS256"],
    issuer: "simaud-api",
    audience: "simaud-web",
  });
  return payload;
}
