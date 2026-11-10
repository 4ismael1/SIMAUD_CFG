import { boundedReportRows, withReportRead } from "./limits.js";
import { localDateRange } from "../../lib/sql.js";
import { sql, type SQL } from "drizzle-orm";
import { forbidden, invalid, type Actor } from "../contracts/service.js";
import type { Query } from "./schemas.js";

export type ReportRow = Record<string, string | number | null>;
export type Report = {
  rows: ReportRow[];
  totals: ReportRow;
  byManager?: ReportRow[];
  bySupervisor?: ReportRow[];
};

async function queryRows(query: SQL) {
  return (await withReportRead((tx) => boundedReportRows<ReportRow>(tx, query))).rows;
}

function dateFilter(query: Query, column: SQL) {
  return localDateRange(column, query.from, query.to);
}

export async function contractReport(actor: Actor, query: Query): Promise<Report> {
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
  const filter = sql`
    ${dateFilter(query, sql`c.created_at`)}
    and (${actor.role} <> 'gestor' or c.created_by = ${actor.id})
    and (${query.templateId ?? null}::uuid is null or c.template_id = ${query.templateId ?? null}::uuid)
    and (${query.managerId ?? null}::uuid is null or c.created_by = ${query.managerId ?? null}::uuid)
  `;
  const rows = await queryRows(
    sql`
      select
        ${groupId} "groupId",
        ${group} label,
        count(*)::int count,
        coalesce(sum(c.contract_value), 0)::text value,
        min(c.start_date)::text "startDate",
        max(c.end_date)::text "endDate"
      from contracts c
      left join contract_templates t on t.id = c.template_id
      left join users u on u.id = c.created_by
      where ${filter}
      group by ${groupId},
      ${group}
      order by ${group},
      ${groupId}
    `,
  );
  const [totals] = await queryRows(
    sql`
      select
        count(*)::int count,
        coalesce(sum(c.contract_value), 0)::text value
      from contracts c
      where ${filter}
    `,
  );
  return { rows, totals: totals! };
}

export async function userReport(actor: Actor, query: Query): Promise<Report> {
  if (actor.role !== "admin") throw forbidden();
  const groupBy = query.groupBy ?? "role";
  if (!["role", "activity"].includes(groupBy)) throw invalid("Agrupación inválida.");
  const group =
    groupBy === "role"
      ? sql`role::text`
      : sql`
        case
        when not is_active
        then 'inactive'
        when last_login_at >= now() - interval '30 days'
        then 'recent'
        else 'no_recent_login'
        end
      `;
  const rows = await queryRows(
    sql`
      select
        ${group} label,
        count(*)::int count
      from users
      where deleted_at is null and ${dateFilter(query, sql`created_at`)}
      group by ${group}
      order by ${group}
    `,
  );
  const [totals] = await queryRows(
    sql`select count(*)::int count from users where deleted_at is null and ${dateFilter(query, sql`created_at`)}`,
  );
  return { rows, totals: totals! };
}

export async function approvalReport(actor: Actor, query: Query): Promise<Report> {
  const filter = sql`
    ${dateFilter(query, sql`a.reviewed_at`)}
    and a.status <> 'pending'
    and (${actor.role} <> 'gestor' or c.created_by = ${actor.id})
    and (${query.templateId ?? null}::uuid is null or c.template_id = ${query.templateId ?? null}::uuid)
    and (${query.managerId ?? null}::uuid is null or c.created_by = ${query.managerId ?? null}::uuid)
  `;
  const metrics = sql`
    count(*)::int count,
    count(*) filter (where a.status = 'approved')::int approved,
    count(*) filter (where a.status = 'rejected')::int returned,
    coalesce(
      round(
        avg(extract(epoch from a.reviewed_at - a.requested_at) / 86400),
        2
      ),
      0
    )::text "avgApprovalDays",
    coalesce(
      round(
        100.0 * count(*) filter (where a.status = 'rejected') / nullif(count(*), 0),
        2
      ),
      0
    )::text "returnRate"
  `;
  const byManager = await queryRows(
    sql`
      select
        c.created_by::text "managerId",
        u.name label,
        ${metrics}
      from contract_approvals a
      join contracts c on c.id = a.contract_id
      left join users u on u.id = c.created_by
      where ${filter}
      group by c.created_by,
      u.name
      order by u.name,
      c.created_by
    `,
  );
  const bySupervisor = await queryRows(
    sql`
      select
        a.reviewed_by::text "supervisorId",
        u.name label,
        ${metrics}
      from contract_approvals a
      join contracts c on c.id = a.contract_id
      left join users u on u.id = a.reviewed_by
      where ${filter}
      group by a.reviewed_by,
      u.name
      order by u.name,
      a.reviewed_by
    `,
  );
  const [totals] = await queryRows(
    sql`
      select
        ${metrics}
      from contract_approvals a
      join contracts c on c.id = a.contract_id
      where ${filter}
    `,
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
