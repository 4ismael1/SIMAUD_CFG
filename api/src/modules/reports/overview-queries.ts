import { sql, type SQL } from "drizzle-orm";
import type { Transaction } from "../../db/client.js";
import type { Actor } from "../contracts/service.js";
import type { DateRange, OverviewQuery } from "./overview-schema.js";

export function overviewScope(actor: Actor, query: OverviewQuery) {
  const managerId = actor.role === "gestor" ? actor.id : query.managerId;
  const statuses = query.status
    ? sql`c.status::text in (${sql.join(
        query.status.map((status) => sql`${status}`),
        sql`, `,
      )})`
    : sql`true`;
  return sql`
    (${managerId ?? null}::uuid is null or c.created_by = ${managerId ?? null}::uuid)
    and (${query.templateId ?? null}::uuid is null or c.template_id = ${query.templateId ?? null}::uuid)
    and ${statuses}
  `;
}

export function inRange(column: SQL, range: DateRange) {
  return sql`${column} >= ${range.from}::date::timestamp at time zone 'America/Santo_Domingo'
    and ${column} < (${range.to}::date + 1)::timestamp at time zone 'America/Santo_Domingo'`;
}

// Activation means completed signatures, including imported contracts without audit history.
export const activations = sql`select s.contract_id, max(s.signed_at) activated_at
  from contract_signatories s
  group by s.contract_id
  having bool_and(s.status = 'signed' and s.signed_at is not null)`;

export async function overviewMetrics(tx: Transaction, scope: SQL, range: DateRange) {
  const result = await tx.execute<{
    created: number;
    totalValue: number;
    averageValue: number | null;
    activated: number;
    cancelled: number;
    approvalRate: number | null;
    avgApprovalDays: number | null;
    avgSigningDays: number | null;
  }>(sql`
    with eligible as (select c.* from contracts c where ${scope}),
    activation as (${activations}),
    decisions as (
      select a.* from contract_approvals a join eligible c on c.id = a.contract_id
      where a.status <> 'pending' and ${inRange(sql`a.reviewed_at`, range)}
    )
    select
      count(*)::int created,
      coalesce(sum(c.contract_value), 0)::float8 "totalValue",
      avg(c.contract_value)::float8 "averageValue",
      (select count(*)::int from activation s join eligible c on c.id = s.contract_id
        where ${inRange(sql`s.activated_at`, range)}) activated,
      (select count(distinct x.contract_id)::int from contract_cancellations x
        join eligible c on c.id = x.contract_id where x.status = 'approved'
        and ${inRange(sql`x.approved_at`, range)}) cancelled,
      (select (count(*) filter (where status = 'approved')::numeric / nullif(count(*), 0))::float8
        from decisions) "approvalRate",
      (select avg(extract(epoch from reviewed_at - requested_at) / 86400)::float8
        from decisions) "avgApprovalDays",
      (select avg(extract(epoch from s.activated_at - a.reviewed_at) / 86400)::float8
        from activation s join eligible c on c.id = s.contract_id
        join lateral (select reviewed_at from contract_approvals
          where contract_id = c.id and status = 'approved' and reviewed_at <= s.activated_at
          order by reviewed_at desc, id limit 1) a on true
        where ${inRange(sql`s.activated_at`, range)}) "avgSigningDays"
    from eligible c where ${inRange(sql`c.created_at`, range)}
  `);
  return result.rows[0]!;
}

export async function overviewTimeline(
  tx: Transaction,
  scope: SQL,
  range: DateRange,
  granularity: OverviewQuery["granularity"],
) {
  return (
    await tx.execute<{ day: string; created: number; activated: number; value: number }>(sql`
    with eligible as (select c.* from contracts c where ${scope}), activation as (${activations}),
    events as (
      select c.created_at at time zone 'America/Santo_Domingo' at,
        1 created, 0 activated, coalesce(c.contract_value, 0) value
      from eligible c where ${inRange(sql`c.created_at`, range)}
      union all
      select a.activated_at at time zone 'America/Santo_Domingo', 0, 1, 0
      from activation a join eligible c on c.id = a.contract_id
      where ${inRange(sql`a.activated_at`, range)}
    )
    select to_char(date_trunc(${granularity}, at), 'YYYY-MM-DD') "day",
      sum(created)::int created, sum(activated)::int activated, sum(value)::float8 value
    from events group by 1 order by 1
  `)
  ).rows;
}

export async function overviewApprovals(tx: Transaction, scope: SQL, range: DateRange) {
  const eligible = sql`select a.* from contract_approvals a join contracts c on c.id = a.contract_id
    where ${scope} and ((a.status = 'pending' and ${inRange(sql`a.requested_at`, range)})
      or (a.status <> 'pending' and ${inRange(sql`a.reviewed_at`, range)}))`;
  const metrics = sql`count(*) filter (where a.status <> 'pending')::int decided,
    count(*) filter (where a.status = 'approved')::int approved,
    count(*) filter (where a.status = 'rejected')::int returned`;
  const totals = (
    await tx.execute<{ decided: number; approved: number; returned: number; pending: number }>(sql`
    with eligible as (${eligible}) select ${metrics},
      count(*) filter (where a.status = 'pending')::int pending from eligible a
  `)
  ).rows[0]!;
  const bySupervisor = (
    await tx.execute<{
      supervisorId: string;
      name: string;
      decided: number;
      approved: number;
      returned: number;
      avgResponseDays: number | null;
    }>(sql`with eligible as (${eligible}) select a.reviewed_by "supervisorId", u.name,
    ${metrics}, avg(extract(epoch from a.reviewed_at - a.requested_at) / 86400)::float8 "avgResponseDays"
    from eligible a join users u on u.id = a.reviewed_by where a.status <> 'pending'
    group by a.reviewed_by, u.name order by decided desc, a.reviewed_by`)
  ).rows;
  return { ...totals, bySupervisor };
}
