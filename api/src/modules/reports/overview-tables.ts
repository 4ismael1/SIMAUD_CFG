import { boundedReportRows } from "./limits.js";
import { sql, type SQL } from "drizzle-orm";
import type { Transaction } from "../../db/client.js";
import { contractStatus, type Role } from "../../db/schema.js";
import { activations, inRange } from "./overview-queries.js";
import type { DateRange, OverviewQuery } from "./overview-schema.js";
import { periods, periodInfo } from "./overview-periods.js";

type Status = (typeof contractStatus.enumValues)[number];
const valueRanges = [
  { key: "<50k", label: "Menos de RD$ 50,000", min: 0, max: 50000 },
  { key: "50k–250k", label: "RD$ 50,000 a menos de 250,000", min: 50000, max: 250000 },
  { key: "250k–1M", label: "RD$ 250,000 a menos de 1 millón", min: 250000, max: 1000000 },
  { key: "1M–5M", label: "RD$ 1 a 5 millones", min: 1000000, max: 5000000 },
  { key: ">5M", label: "Más de RD$ 5 millones", min: 5000000, max: null },
];

export async function overviewTables(tx: Transaction, scope: SQL, range: DateRange) {
  const created = sql`${scope} and ${inRange(sql`c.created_at`, range)}`;
  const measures = sql`count(*)::int count, coalesce(sum(c.contract_value), 0)::numeric(30,2)::text value`;
  const statusRows = (
    await boundedReportRows<{ status: Status; count: number; value: string }>(
      tx,
      sql`
    select c.status, ${measures} from contracts c where ${created} group by c.status
  `,
    )
  ).rows;
  const byStatus = contractStatus.enumValues.map(
    (status) =>
      statusRows.find((row) => row.status === status) ?? { status, count: 0, value: "0.00" },
  );
  const byTemplate = (
    await boundedReportRows<{
      templateId: string | null;
      label: string;
      count: number;
      value: string;
    }>(
      tx,
      sql`
    select c.template_id "templateId", coalesce(t.title, 'Sin plantilla') label, ${measures}
    from contracts c left join contract_templates t on t.id = c.template_id where ${created}
    group by c.template_id, t.title order by count desc, c.template_id nulls last
  `,
    )
  ).rows;
  const topContracts = (
    await boundedReportRows<{
      id: string;
      code: string;
      title: string;
      status: Status;
      contractValue: string;
      managerName: string | null;
      createdAt: string;
    }>(
      tx,
      sql`select c.id, c.code, c.title, c.status, c.contract_value::text "contractValue",
    u.name "managerName", c.created_at "createdAt" from contracts c left join users u on u.id = c.created_by
    where ${created} and c.contract_value is not null order by c.contract_value desc, c.id limit 10`,
    )
  ).rows;
  const bands = (
    await boundedReportRows<{ band: number; count: number; value: string }>(
      tx,
      sql`
    select case when c.contract_value < 50000 then 0 when c.contract_value < 250000 then 1
      when c.contract_value < 1000000 then 2 when c.contract_value <= 5000000 then 3 else 4 end band,
      ${measures} from contracts c where ${created} and c.contract_value is not null
    group by 1
  `,
    )
  ).rows;
  const ranges = valueRanges.map((band, index) => {
    const values = bands.find((row) => row.band === index);
    return { ...band, count: values?.count ?? 0, value: values?.value ?? "0.00" };
  });
  return {
    byStatus,
    byTemplate,
    topContracts: topContracts.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
    valueRanges: ranges,
  };
}

export async function overviewManagers(tx: Transaction, scope: SQL, range: DateRange) {
  return (
    await boundedReportRows<{
      managerId: string;
      name: string;
      count: number;
      value: string;
      activated: number;
      approvalRate: number | null;
      avgApprovalDays: number | null;
    }>(
      tx,
      sql`
    with eligible as (select c.* from contracts c where ${scope}), activation as (${activations}),
    created as (select c.created_by, count(*)::int count, coalesce(sum(c.contract_value),0)::numeric(30,2) value
      from eligible c where ${inRange(sql`c.created_at`, range)} group by c.created_by),
    signed as (select c.created_by, count(*)::int activated from activation a join eligible c on c.id = a.contract_id
      where ${inRange(sql`a.activated_at`, range)} group by c.created_by),
    decided as (select c.created_by,
      (count(*) filter (where a.status = 'approved')::numeric / nullif(count(*),0))::float8 rate,
      avg(extract(epoch from a.reviewed_at - a.requested_at) / 86400)::float8 days
      from contract_approvals a join eligible c on c.id = a.contract_id
      where a.status <> 'pending' and ${inRange(sql`a.reviewed_at`, range)} group by c.created_by)
    select u.id "managerId", u.name, coalesce(c.count,0) count, coalesce(c.value,0)::numeric(30,2)::text value,
      coalesce(s.activated,0) activated, d.rate "approvalRate", d.days "avgApprovalDays"
    from users u left join created c on c.created_by = u.id left join signed s on s.created_by = u.id
    left join decided d on d.created_by = u.id
    where c.created_by is not null or s.created_by is not null or d.created_by is not null
    order by count desc, u.id
  `,
    )
  ).rows;
}

export async function overviewUsers(
  tx: Transaction,
  range: DateRange,
  previousRange: DateRange,
  granularity: OverviewQuery["granularity"],
) {
  const totals = (
    await boundedReportRows<{ total: number; active: number; current: number; previous: number }>(
      tx,
      sql`
    select count(*)::int total, count(*) filter (where is_active)::int active,
      count(*) filter (where ${inRange(sql`created_at`, range)})::int current,
      count(*) filter (where ${inRange(sql`created_at`, previousRange)})::int previous
    from users where deleted_at is null
  `,
    )
  ).rows[0]!;
  const byRole = (
    await boundedReportRows<{ role: Role; count: number }>(
      tx,
      sql`
    select e.enumlabel role, count(u.id)::int count from pg_enum e
    join pg_type t on t.oid = e.enumtypid and t.typname = 'user_role'
    left join users u on u.role::text = e.enumlabel and u.deleted_at is null
    group by e.enumlabel order by e.enumlabel
  `,
    )
  ).rows;
  const registrationRows = (
    await boundedReportRows<{ day: string; count: number }>(
      tx,
      sql`
    select to_char(date_trunc(${granularity}, created_at at time zone 'America/Santo_Domingo'), 'YYYY-MM-DD') "day",
      count(*)::int count from users where deleted_at is null and ${inRange(sql`created_at`, range)}
    group by 1 order by 1
  `,
    )
  ).rows;
  const counts = new Map(
    registrationRows.map((row) => [periodInfo(row.day, granularity).period, row.count]),
  );
  const registrations = periods(range, granularity).map(({ period, label }) => ({
    period,
    label,
    count: counts.get(period) ?? 0,
  }));
  return {
    total: totals.total,
    active: totals.active,
    newInRange: { value: totals.current, previous: totals.previous },
    byRole,
    registrations,
  };
}
