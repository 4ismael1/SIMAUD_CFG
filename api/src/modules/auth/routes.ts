import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { env } from "../../config/env.js";
import type { Mailer } from "../../lib/mailer.js";
import { authenticate } from "../../plugins/auth.js";
import * as schema from "./schemas.js";
import * as service from "./service.js";
export const cookieName = "simaud_rt";
export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/api/v1/auth",
};
const context = (r: FastifyRequest) => ({
  ip: r.ip,
  userAgent: r.headers["user-agent"],
});
export async function authRoutes(app: FastifyInstance, send: Mailer) {
  const a = app.withTypeProvider<ZodTypeProvider>();
  const generic = {
    message: "Si la cuenta corresponde, recibirás un email con las instrucciones.",
  };
  a.post(
    "/register",
    {
      schema: { body: schema.registerBody },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (r, reply) => reply.code(201).send(await service.register(r.body, send)),
  );
  a.get(
    "/availability",
    {
      schema: { querystring: schema.availabilityQuery },
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (r) => {
      const { email, cedula } = r.query;
      const [e, c] = await Promise.all([
        email ? db.select({ id: users.id }).from(users).where(eq(users.email, email)) : [],
        cedula ? db.select({ id: users.id }).from(users).where(eq(users.cedula, cedula)) : [],
      ]);
      return { emailAvailable: !e.length, cedulaAvailable: !c.length };
    },
  );
  a.post(
    "/login",
    {
      schema: { body: schema.loginBody },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
          keyGenerator: (r: FastifyRequest) =>
            r.ip +
            ":" +
            String((r.body as { email?: unknown })?.email ?? "")
              .trim()
              .toLowerCase(),
        },
      },
    },
    async (r, reply) => {
      const result = await service.login(r.body.email, r.body.password, context(r));
      reply.setCookie(cookieName, result.refreshToken, {
        ...cookieOptions,
        maxAge: 30 * 86400,
      });
      return { accessToken: result.accessToken, user: result.user };
    },
  );
  a.post(
    "/refresh",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (r, reply) => {
      const result = await service.refresh(r.cookies[cookieName], context(r));
      reply.setCookie(cookieName, result.refreshToken, {
        ...cookieOptions,
        maxAge: 30 * 86400,
      });
      return { accessToken: result.accessToken };
    },
  );
  a.post("/logout", async (r, reply) => {
    await service.logout(r.cookies[cookieName]);
    reply.clearCookie(cookieName, cookieOptions);
    return { message: "Sesión cerrada." };
  });
  a.post("/logout-all", { preHandler: authenticate }, async (r, reply) => {
    await db.transaction(async (tx) => {
      await service.lockUser(tx, r.user.id);
      await service.revokeSessions(tx, r.user.id);
    });
    reply.clearCookie(cookieName, cookieOptions);
    return { message: "Sesiones cerradas." };
  });
  a.post("/confirm-email", { schema: { body: schema.tokenBody } }, async (r) => {
    await service.consumeToken(r.body.token, "email_confirmation");
    return { message: "Email confirmado." };
  });
  a.post(
    "/resend-confirmation",
    {
      schema: { body: schema.emailBody },
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
    },
    async (r) => {
      await service.requestToken(r.body.email, "email_confirmation", send);
      return generic;
    },
  );
  a.post(
    "/forgot-password",
    {
      schema: { body: schema.emailBody },
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
    },
    async (r) => {
      await service.requestToken(r.body.email, "password_reset", send);
      return generic;
    },
  );
  a.post("/reset-password", { schema: { body: schema.resetBody } }, async (r) => {
    await service.consumeToken(r.body.token, "password_reset", r.body.password);
    return { message: "Contraseña actualizada." };
  });
}
