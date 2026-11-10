import type { Report, ReportRow } from "./service.js";
import type { ReportsOverview } from "./overview.js";
import { exportReportTables } from "./export.js";

export function overviewExportTables(overview: ReportsOverview): Record<string, Report> {
  const table = (rows: ReportRow[]): Report => ({ rows, totals: {} });
  const tables: Record<string, Report> = {
    Resumen: table(
      Object.entries(overview.kpis).map(([indicator, comparison]) => ({
        indicator,
        ...comparison,
      })),
    ),
    Rangos: table([
      { tipo: "actual", ...overview.range },
      { tipo: "anterior", ...overview.previousRange },
    ]),
    Evolución: table(overview.timeline),
    Estados: table(overview.byStatus),
    Plantillas: table(overview.byTemplate),
    Gestores: table(overview.byManager),
    Valores: table(overview.valueRanges),
    "Mayores contratos": table(overview.topContracts),
    Aprobaciones: table([
      {
        decided: overview.approvals.decided,
        approved: overview.approvals.approved,
        returned: overview.approvals.returned,
        pending: overview.approvals.pending,
      },
    ]),
    Supervisores: table(overview.approvals.bySupervisor),
  };
  if ("users" in overview) {
    tables.Usuarios = table([
      {
        total: overview.users.total,
        active: overview.users.active,
        newInRange: overview.users.newInRange.value,
        previousNew: overview.users.newInRange.previous,
      },
    ]);
    tables.Roles = table(overview.users.byRole);
    tables.Registros = table(overview.users.registrations);
  }
  return tables;
}

export function exportOverview(overview: ReportsOverview, format: "csv" | "xlsx" | "pdf") {
  return exportReportTables(overviewExportTables(overview), format, "Resumen de reportes");
}
