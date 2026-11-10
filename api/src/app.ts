import { notificationRoutes } from "./modules/notifications/routes.js";
import { renewalRoutes } from "./modules/renewals/routes.js";
import { systemRoutes } from "./modules/system/routes.js";
import { dashboardRoutes } from "./modules/dashboard/routes.js";
import { reportRoutes } from "./modules/reports/routes.js";
import { pdfRoutes } from "./modules/contracts/pdf.js";
import { startScheduler } from "./jobs/index.js";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { sql } from "drizzle-orm";
import { env } from "./config/env.js";
import { db } from "./db/client.js";
import { ApiError, installErrors } from "./lib/errors.js";
import { sendMail, type Mailer } from "./lib/mailer.js";
import { installAuth } from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/routes.js";
import { meRoutes } from "./modules/me/routes.js";
import { catalogRoutes } from "./modules/contracts/catalog.js";
import { contractRoutes } from "./modules/contracts/routes.js";
import { userRoutes } from "./modules/users/routes.js";
import { initializeSigning } from "./lib/crypto/system-signing.js";
import { verifyRoutes } from "./modules/verify/routes.js";
import { signatureStyleRoutes } from "./modules/contracts/signature-style.js";
import { auditRoutes } from "./modules/audit/routes.js";
export async function buildApp(
  options: { logger?: boolean; mailer?: Mailer } = {},
): Promise<FastifyInstance> {
  initializeSigning();
  const app = Fastify({
    logger: options.logger ?? env.NODE_ENV !== "test",
    trustProxy:
      typeof env.TRUST_PROXY === "number"
        ? (_address, hop) => hop < (env.TRUST_PROXY as number)
        : env.TRUST_PROXY,
    bodyLimit: 2 * 1024 * 1024,
    logController: new LogController({ disableRequestLogging: true }),
    routerOptions: { ignoreTrailingSlash: true, maxParamLength: 200 },
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  installErrors(app);
  await app.register(helmet);
  await app.register(cors, {
    origin: new URL(env.APP_URL).origin,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    hook: "preHandler",
    errorResponseBuilder: () =>
      new ApiError(429, "RATE_LIMITED", "Demasiados intentos. Inténtalo más tarde."),
  });
  await app.register(multipart, {
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  });
  app.addHook("onRequest", async (request) => {
    // Cookie authenticated mutations must come from the configured frontend.
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      request.headers.origin &&
      request.headers.origin !== new URL(env.APP_URL).origin
    )
      throw new ApiError(403, "FORBIDDEN", "El origen de la solicitud no está permitido.");
  });
  installAuth(app);
  const mailer = options.mailer ?? sendMail;
  await app.register(
    async (routes) => {
      routes.get("/health", async () => {
        await db.execute(sql`select 1`);
        return { status: "ok", db: "ok" };
      });
      await routes.register(async (auth) => authRoutes(auth), {
        prefix: "/auth",
      });
      await notificationRoutes(routes);
      await renewalRoutes(routes);
      await systemRoutes(routes, mailer);
      await dashboardRoutes(routes);
      await reportRoutes(routes);
      await auditRoutes(routes);
      await pdfRoutes(routes);
      await verifyRoutes(routes);
      await signatureStyleRoutes(routes);
      await meRoutes(routes);
      await catalogRoutes(routes);
      await contractRoutes(routes);
      await routes.register(async (users) => userRoutes(users), {
        prefix: "/users",
      });
    },
    { prefix: "/api/v1" },
  );
  const stopScheduler = startScheduler(mailer, () =>
    app.log.error({ event: "job.failed" }, "Falló una tarea programada."),
  );
  app.addHook("onClose", async () => stopScheduler());
  await app.ready();
  return app;
}
