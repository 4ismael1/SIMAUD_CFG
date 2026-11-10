import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { env } from "../../config/env.js";
import { authenticate } from "../../plugins/auth.js";
import * as schema from "./schemas.js";
import * as service from "./service.js";
import { aggregateIpLimit } from "./rate-limit.js";
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
export async function authRoutes(app: FastifyInstance) {
  const a = app.withTypeProvider<ZodTypeProvider>();
  const loginBudget = aggregateIpLimit(app, 20);
  const publicBudget = aggregateIpLimit(app, 10);
  const generic = {
    message: "Si la cuenta corresponde, recibirás un email con las instrucciones.",
  };
  a.post(
    "/register",
    {
      schema: { body: schema.registerBody },
      onRequest: publicBudget,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (r, reply) => reply.code(202).send(await service.register(r.body)),
  );
  a.post(
    "/login",
    {
      schema: { body: schema.loginBody },
      onRequest: loginBudget,
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
    await service.logoutAll(r.user.id);
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
      onRequest: publicBudget,
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
    },
    async (r) => {
      await service.requestToken(r.body.email, "email_confirmation");
      return generic;
    },
  );
  a.post(
    "/forgot-password",
    {
      schema: { body: schema.emailBody },
      onRequest: publicBudget,
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
    },
    async (r) => {
      await service.requestToken(r.body.email, "password_reset");
      return generic;
    },
  );
  a.post("/reset-password", { schema: { body: schema.resetBody } }, async (r) => {
    await service.consumeToken(r.body.token, "password_reset", r.body.password);
    return { message: "Contraseña actualizada." };
  });
}
