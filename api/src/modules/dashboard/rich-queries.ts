import { sql, type SQL } from "drizzle-orm";
import { santoDomingoToday } from "../../lib/sql.js";
import { rows, object, currentMonth } from "./queries.js";

export async function adminTotals() {
  return object(sql`select jsonb_build_object(
    'users', (select count(*) from users where deleted_at is null),
    'newUsersThisMonth', (select count(*) from users where deleted_at is null
      and created_at >= ${currentMonth} at time zone 'America/Santo_Domingo'
      and created_at < (${currentMonth} + interval '1 month') at time zone 'America/Santo_Domingo'),
    'contracts', count(*),
    'newContractsThisMonth', count(*) filter (where created_at >= ${currentMonth} at time zone 'America/Santo_Domingo'
      and created_at < (${currentMonth} + interval '1 month') at time zone 'America/Santo_Domingo'),
    'totalValue', coalesce(sum(contract_value),0)::numeric(30,2)::text, 'averageValue', round(avg(contract_value),2)::text,
    'approvalRate', (select count(*) filter (where status = 'approved')::numeric / nullif(count(*),0)
      from contract_approvals where status <> 'pending')
  ) value from contracts`);
}

export async function topManagers() {
  return rows(sql`select u.id "managerId", u.name, count(*)::int count,
    coalesce(sum(c.contract_value),0)::text value from contracts c join users u on u.id = c.created_by
    where c.created_at >= (${santoDomingoToday} - 89)::timestamp at time zone 'America/Santo_Domingo'
    and c.created_at < (${santoDomingoToday} + 1)::timestamp at time zone 'America/Santo_Domingo'
    group by u.id, u.name order by count desc, sum(c.contract_value) desc, u.id limit 5`);
}

export async function usersByRole() {
  return rows(sql`select e.enumlabel role, count(u.id)::int count from pg_enum e
    join pg_type t on t.oid = e.enumtypid and t.typname = 'user_role'
    left join users u on u.role::text = e.enumlabel and u.deleted_at is null
    group by e.enumlabel order by e.enumlabel`);
}

export async function recentContractActivity() {
  const activity = await rows<{
    id: string;
    at: string;
    action: string;
    actorName: string | null;
    contractId: string | null;
    contractCode: string | null;
    contractTitle: string | null;
  }>(sql`select l.id, l.created_at at, l.action, u.name "actorName",
    l.contract_id "contractId", c.code "contractCode", c.title "contractTitle"
    from contract_audit_logs l left join contracts c on c.id = l.contract_id
    left join users u on u.id = l.user_id where l.entity_type = 'contract'
    order by l.created_at desc, l.id desc limit 15`);
  return activity.map((entry) => ({ ...entry, at: new Date(entry.at).toISOString() }));
}

export async function supervisorCatalog() {
  return object(sql`select jsonb_build_object(
    'activeTemplates', (select count(*) from contract_templates where status = 'active'),
    'variables', (select count(*) from template_variables),
    'contractsFromTemplates', (select count(*) from contracts where template_id is not null)
  ) value`);
}

export async function templatesByCategory() {
  return rows(
    sql`select category, count(*)::int count from contract_templates group by category order by category`,
  );
}

export async function gestorMonthly(scope: SQL) {
  return rows(sql`with months as (select generate_series(${currentMonth} - interval '11 months',
    ${currentMonth}, interval '1 month') as month),
    signed as (select contract_id, min(created_at) signed_at from contract_audit_logs
      where new_values ->> 'status' = 'active' and old_values ->> 'status' is distinct from 'active'
      group by contract_id)
    select to_char(m.month, 'YYYY-MM') as month,
      (select count(*)::int from contracts c where ${scope}
        and c.created_at >= m.month at time zone 'America/Santo_Domingo'
        and c.created_at < (m.month + interval '1 month') at time zone 'America/Santo_Domingo') created,
      (select count(*)::int from signed s join contracts c on c.id = s.contract_id where ${scope}
        and s.signed_at >= m.month at time zone 'America/Santo_Domingo'
        and s.signed_at < (m.month + interval '1 month') at time zone 'America/Santo_Domingo') signed,
      (select coalesce(sum(c.contract_value),0)::text from contracts c where ${scope}
        and c.created_at >= m.month at time zone 'America/Santo_Domingo'
        and c.created_at < (m.month + interval '1 month') at time zone 'America/Santo_Domingo') value
    from months m order by m.month`);
}

export async function gestorStatuses(scope: SQL) {
  return rows(sql`select e.enumlabel status, count(c.id)::int count from pg_enum e
    join pg_type t on t.oid = e.enumtypid and t.typname = 'contract_status'
    left join contracts c on c.status::text = e.enumlabel and ${scope}
    group by e.enumlabel order by e.enumlabel`);
}

export async function gestorExpirations(scope: SQL) {
  return rows(sql`select c.id, c.code, c.title, c.end_date "endDate", c.contract_value::text value
    from contracts c where ${scope} and c.status in ('active', 'expiring_soon')
    and c.end_date >= ${santoDomingoToday} order by c.end_date, c.id limit 5`);
}
