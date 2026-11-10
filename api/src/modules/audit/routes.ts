import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireRole } from "../../plugins/auth.js";
import { listQuery, exportQuery } from "./schemas.js";
import { listAudit } from "./queries.js";
import { exportAudit } from "./export.js";

export async function auditRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();
  const admin = requireRole("admin");
  routes.get(
    "/audit",
    { preHandler: admin, schema: { querystring: listQuery } },
    async (req, reply) => {
      reply.header("Cache-Control", "private, no-store");
      return listAudit(req.query);
    },
  );
  routes.get(
    "/audit/export",
    { preHandler: admin, schema: { querystring: exportQuery } },
    async (req, reply) => {
      const bytes = await exportAudit(req.query, req.query.format);
      return reply
        .header("Cache-Control", "private, no-store")
        .header("Content-Disposition", `attachment; filename="audit.${req.query.format}"`)
        .type(
          req.query.format === "csv"
            ? "text/csv; charset=utf-8"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .send(bytes);
    },
  );
}
