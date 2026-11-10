import type { FastifyInstance } from "fastify";
import { requireRole } from "../../plugins/auth.js";
import { parse } from "../contracts/schemas.js";
import { invalid, type Actor } from "../contracts/service.js";
import { querySchema, type Query } from "./schemas.js";
import { contractReport, userReport, approvalReport } from "./service.js";
import { exportReport } from "./export.js";
import { overviewSchema } from "./overview-schema.js";
import { reportsOverview, reportFilters } from "./overview.js";
import { exportOverview } from "./overview-export.js";

export { csvCell, exportReport } from "./export.js";

export async function reportRoutes(app: FastifyInstance) {
  const staff = { preHandler: requireRole("admin", "supervisor", "gestor") };
  app.get("/reports/filters", staff, (req) => reportFilters(req.user));
  app.get("/reports/overview", staff, (req) =>
    reportsOverview(req.user, parse(overviewSchema, req.query)),
  );
  app.get("/reports/overview/export", staff, async (req, reply) => {
    const query = parse(overviewSchema, req.query);
    const overview = await reportsOverview(req.user, query);
    const format = query.format ?? "csv";
    const bytes = await exportOverview(overview, format);
    return reply
      .header("Cache-Control", "private, no-store")
      .header("Content-Disposition", `attachment; filename="overview.${format}"`)
      .type(
        {
          csv: "text/csv; charset=utf-8",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          pdf: "application/pdf",
        }[format],
      )
      .send(bytes);
  });
  for (const type of ["contracts", "users", "approvals"] as const) {
    const getReport = (actor: Actor, query: Query) =>
      type === "contracts"
        ? contractReport(actor, query)
        : type === "users"
          ? userReport(actor, query)
          : approvalReport(actor, query);
    app.get("/reports/" + type, staff, async (req) => {
      const query = parse(querySchema, req.query);
      if (query.from && query.to && query.from > query.to)
        throw invalid("Rango de fechas inválido.");
      return getReport(req.user, query);
    });
    app.get("/reports/" + type + "/export", staff, async (req, reply) => {
      const query = parse(querySchema, req.query);
      if (query.from && query.to && query.from > query.to)
        throw invalid("Rango de fechas inválido.");
      const report = await getReport(req.user, query);
      const format = query.format ?? "csv";
      const bytes = await exportReport(report, format, type);
      const mime = {
        csv: "text/csv; charset=utf-8",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        pdf: "application/pdf",
      }[format];
      return reply
        .header("Cache-Control", "private, no-store")
        .header("Content-Disposition", 'attachment; filename="' + type + "." + format + '"')
        .type(mime)
        .send(bytes);
    });
  }
}
