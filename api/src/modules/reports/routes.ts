import type { FastifyInstance } from "fastify";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import ExcelJS from "exceljs";
import type { Content } from "pdfmake/interfaces.js";
import { db } from "../../db/client.js";
import { requireRole } from "../../plugins/auth.js";
import { parse, uuid } from "../contracts/schemas.js";
import { forbidden, invalid, type Actor } from "../contracts/service.js";
import { makePdf } from "../../lib/pdf.js";
type ReportRow = Record<string, string | number | null>;
type Report = {
  rows: ReportRow[];
  totals: ReportRow;
  byManager?: ReportRow[];
  bySupervisor?: ReportRow[];
};
const querySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    groupBy: z.enum(["status", "month", "template", "manager", "role", "activity"]).optional(),
    templateId: uuid.optional(),
    managerId: uuid.optional(),
    format: z.enum(["csv", "xlsx", "pdf"]).optional(),
  })
  .strict();
type Query = z.infer<typeof querySchema>;
async function queryRows(query: SQL) {
  return (await db.execute<ReportRow>(query)).rows;
}
function dateFilter(query: Query, column: SQL) {
  return sql`(${query.from ?? null}::date is null or ${column}>=${query.from ?? null}::date at time zone 'America/Santo_Domingo') and (${query.to ?? null}::date is null or ${column}<(${query.to ?? null}::date+1) at time zone 'America/Santo_Domingo')`;
}
async function contractReport(actor: Actor, query: Query): Promise<Report> {
  const groups = {
    status: sql`c.status::text`,
    month: sql`to_char(c.created_at at time zone 'America/Santo_Domingo','YYYY-MM')`,
    template: sql`coalesce(t.title,'Sin plantilla')`,
    manager: sql`coalesce(u.name,'Sin gestor')`,
  };
  const groupBy = query.groupBy ?? "status";
  if (!(groupBy in groups)) throw invalid("Agrupación inválida.");
  const group = groups[groupBy as keyof typeof groups];
  const groupId =
    groupBy === "template"
      ? sql`c.template_id::text`
      : groupBy === "manager"
        ? sql`c.created_by::text`
        : group;
  const filter = sql`${dateFilter(query, sql`c.created_at`)} and (${actor.role}<>'gestor' or c.created_by=${actor.id}) and (${query.templateId ?? null}::uuid is null or c.template_id=${query.templateId ?? null}::uuid) and (${query.managerId ?? null}::uuid is null or c.created_by=${query.managerId ?? null}::uuid)`;
  const rows = await queryRows(
    sql`select ${groupId} "groupId",${group} label,count(*)::int count,coalesce(sum(c.contract_value),0)::text value,min(c.start_date)::text "startDate",max(c.end_date)::text "endDate" from contracts c left join contract_templates t on t.id=c.template_id left join users u on u.id=c.created_by where ${filter} group by ${groupId},${group} order by ${group},${groupId}`,
  );
  const [totals] = await queryRows(
    sql`select count(*)::int count,coalesce(sum(c.contract_value),0)::text value from contracts c where ${filter}`,
  );
  return { rows, totals: totals! };
}
async function userReport(actor: Actor, query: Query): Promise<Report> {
  if (actor.role !== "admin") throw forbidden();
  const groupBy = query.groupBy ?? "role";
  if (!["role", "activity"].includes(groupBy)) throw invalid("Agrupación inválida.");
  const group =
    groupBy === "role"
      ? sql`role::text`
      : sql`case when not is_active then 'inactive' when last_login_at>=now()-interval '30 days' then 'recent' else 'no_recent_login' end`;
  const rows = await queryRows(
    sql`select ${group} label,count(*)::int count from users where deleted_at is null group by ${group} order by ${group}`,
  );
  const [totals] = await queryRows(
    sql`select count(*)::int count from users where deleted_at is null`,
  );
  return { rows, totals: totals! };
}
async function approvalReport(actor: Actor, query: Query): Promise<Report> {
  const filter = sql`${dateFilter(query, sql`a.reviewed_at`)} and a.status<>'pending' and (${actor.role}<>'gestor' or c.created_by=${actor.id}) and (${query.templateId ?? null}::uuid is null or c.template_id=${query.templateId ?? null}::uuid) and (${query.managerId ?? null}::uuid is null or c.created_by=${query.managerId ?? null}::uuid)`;
  const metrics = sql`count(*)::int count,count(*) filter(where a.status='approved')::int approved,count(*) filter(where a.status='rejected')::int returned,coalesce(round(avg(extract(epoch from a.reviewed_at-a.requested_at)/86400),2),0)::text "avgApprovalDays",coalesce(round(100.0*count(*) filter(where a.status='rejected')/nullif(count(*),0),2),0)::text "returnRate"`;
  const byManager = await queryRows(
    sql`select c.created_by::text "managerId",u.name label,${metrics} from contract_approvals a join contracts c on c.id=a.contract_id left join users u on u.id=c.created_by where ${filter} group by c.created_by,u.name order by u.name,c.created_by`,
  );
  const bySupervisor = await queryRows(
    sql`select a.reviewed_by::text "supervisorId",u.name label,${metrics} from contract_approvals a join contracts c on c.id=a.contract_id left join users u on u.id=a.reviewed_by where ${filter} group by a.reviewed_by,u.name order by u.name,a.reviewed_by`,
  );
  const [totals] = await queryRows(
    sql`select ${metrics} from contract_approvals a join contracts c on c.id=a.contract_id where ${filter}`,
  );
  return {
    rows: [
      ...byManager.map((row) => ({ dimension: "manager", ...row })),
      ...bySupervisor.map((row) => ({ dimension: "supervisor", ...row })),
    ],
    totals: totals!,
    byManager,
    bySupervisor,
  };
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export async function exportReport(report: Report, format: "csv" | "xlsx" | "pdf", title: string) {
  const columns = [...new Set(report.rows.flatMap((row) => Object.keys(row)))];
  if (!columns.length) columns.push(...Object.keys(report.totals));
  const exportRows = [...report.rows, { ...report.totals, label: "TOTAL" }];
  if (format === "csv")
    return Buffer.from(
      "\uFEFF" +
        [
          columns.map(csvCell).join(";"),
          ...exportRows.map((row) =>
            columns.map((column) => csvCell(row[column as keyof typeof row])).join(";"),
          ),
        ].join("\r\n"),
      "utf8",
    );
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SIMAUD";
    const sheet = workbook.addWorksheet(title, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = columns.map((column) => ({
      header: column,
      key: column,
      width: column === "label" ? 35 : 22,
    }));
    for (const row of exportRows) {
      const values: Record<string, unknown> = { ...row };
      for (const column of columns) {
        const value = values[column];
        if (value && /Date$/.test(column)) values[column] = new Date(String(value) + "T00:00:00Z");
        if (value !== null && value !== undefined && column === "value")
          values[column] = Number(value);
      }
      sheet.addRow(values);
    }
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF203850" } };
    sheet.getRow(1).height = 25;
    for (const column of columns) {
      if (column === "value") sheet.getColumn(column).numFmt = '"RD$ "#,##0.00';
      if (/Date$/.test(column)) sheet.getColumn(column).numFmt = "dd/mm/yyyy";
    }
    sheet.getRow(sheet.rowCount).font = { bold: true };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  const body: Content[][] = [
    columns.map((column) => ({ text: column, bold: true, color: "#ffffff", fillColor: "#203850" })),
    ...exportRows.map((row) =>
      columns.map((column) => ({
        text: String(row[column as keyof typeof row] ?? ""),
        fontSize: 8,
      })),
    ),
  ];
  return makePdf(
    [
      { text: title, fontSize: 18, bold: true, margin: [0, 0, 0, 18] },
      {
        table: { headerRows: 1, widths: columns.map(() => "*"), body },
        layout: "lightHorizontalLines",
      },
    ],
    title,
    { pageOrientation: columns.length > 6 ? "landscape" : "portrait" },
  );
}
export async function reportRoutes(app: FastifyInstance) {
  const staff = { preHandler: requireRole("admin", "supervisor", "gestor") };
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
