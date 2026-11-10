import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../modules/contracts/schemas.js";

const empty = z.object({}).strict();
const queriedRoutes = new Set([
  "/templates",
  "/contracts/:id/pdf",
  "/dashboard",
  "/contracts",
  "/contracts/counts",
  "/contracts/:id/versions",
  "/contracts/:id/audit",
  "/contracts/:id/approvals",
  "/approvals",
  "/me/signatures",
  "/renewals",
  "/renewals/eligible",
  "/notifications",
  "/events",
  "/audit",
  "/audit/export",
  "/reports/overview",
  "/reports/overview/export",
  "/reports/contracts",
  "/reports/contracts/export",
  "/reports/users",
  "/reports/users/export",
  "/reports/approvals",
  "/reports/approvals/export",
]);
const emptyPostRoutes = new Set([
  "/templates/:id/duplicate",
  "/auth/refresh",
  "/auth/logout",
  "/auth/logout-all",
  "/events/ticket",
  "/notifications/read-all",
  "/notifications/:id/read",
  "/system/storage/migrate",
  "/system/jobs/:name/run",
  "/users/:id/password-reset",
  "/users/:id/resend-invite",
]);

export function installStrictInputs(app: FastifyInstance) {
  app.addHook("onRoute", (route) => {
    const url = route.url.replace(/^\/api\/v1/, "");
    const params = Object.fromEntries(
      [...url.matchAll(/:([a-zA-Z][a-zA-Z0-9]*)/g)].map((match) => [
        match[1]!,
        z.string().min(1).max(200),
      ]),
    );
    const paramsSchema = z.object(params).strict();
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const noBody =
      methods.every((method) => ["GET", "HEAD", "DELETE"].includes(method)) ||
      emptyPostRoutes.has(url);
    const validate = async (request: import("fastify").FastifyRequest) => {
      parse(paramsSchema, request.params);
      if (!route.schema?.querystring && !queriedRoutes.has(url)) parse(empty, request.query);
      if (noBody) parse(empty, request.body ?? {});
    };
    const existing = route.preValidation;
    route.preValidation = [
      ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
      validate,
    ];
  });
}
