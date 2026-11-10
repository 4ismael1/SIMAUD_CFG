import { santoDomingoToday } from "../../lib/sql.js";
import { sql } from "drizzle-orm";

import { rows, object, currentMonth } from "./queries.js";

export async function getAdminAttention() {
  return await object(sql`
    select
      jsonb_build_object(
        'pendingApprovals',
        (
          select count(*)
          from contract_approvals
          where status = 'pending'
        ),
        'oldestPendingDays',
        (
          select
            coalesce(
              floor(extract(epoch from now() - min(requested_at)) / 86400),
              0
            )::int
          from contract_approvals
          where status = 'pending'
        ),
        'expiring30',
        (
          select count(*)
          from contracts
          where status in ('active', 'expiring_soon')
          and end_date between ${santoDomingoToday} and ${santoDomingoToday} + 30
        ),
        'urgentRenewals',
        (
          select count(*)
          from contract_renewals
          where status = 'pending'
          and priority = 'urgent'
        )
      ) value
  `);
}

export async function getAdminCurrent() {
  return await object(sql`
    select
      jsonb_build_object(
        'activeContracts',
        count(*) filter (where status in ('active', 'expiring_soon')),
        'activeValue',
        coalesce(
          sum(contract_value) filter (where status in ('active', 'expiring_soon')),
          0
        )::text,
        'contractsAwaitingSignatures',
        count(*) filter (where status = 'pending_signatures'),
        'pendingSignatures',
        (
          select count(*)
          from contract_signatories s
          join contracts p on p.id = s.contract_id
          where p.status = 'pending_signatures'
          and s.status = 'pending'
        ),
        'avgApprovalDays',
        (
          select
            coalesce(
              avg(extract(epoch from reviewed_at - requested_at) / 86400),
              0
            )
          from contract_approvals
          where status = 'approved'
          and reviewed_at >= ${currentMonth} at time zone 'America/Santo_Domingo'
        )
      ) value
    from contracts
  `);
}

export async function getAdminHistory() {
  return await rows<{ month: string; metrics: Record<string, unknown> }>(sql`
    with months as (
      select
        generate_series(
          ${currentMonth} - interval '6 months',
          ${currentMonth} - interval '1 month',
          interval '1 month'
        ) as month
    ),
    snapshots as (
      select
        m.month,
        c.id,
        coalesce(
          (
            select
              (l.new_values ->> 'contractValue')::numeric
            from contract_audit_logs l
            where l.contract_id = c.id
            and l.created_at <(m.month + interval '1 month') at time zone 'America/Santo_Domingo'
            and l.new_values ->> 'contractValue' is not null
            order by l.created_at desc,
            l.id desc
            limit 1
          ),
          (
            select
              (l.old_values ->> 'contractValue')::numeric
            from contract_audit_logs l
            where l.contract_id = c.id
            and l.created_at >=(m.month + interval '1 month') at time zone 'America/Santo_Domingo'
            and l.old_values ->> 'contractValue' is not null
            order by l.created_at,
            l.id
            limit 1
          ),
          c.contract_value
        ) contract_value,
        coalesce(
          (
            select
              l.new_values ->> 'status'
            from contract_audit_logs l
            where l.contract_id = c.id
            and l.created_at <(m.month + interval '1 month') at time zone 'America/Santo_Domingo'
            and l.new_values ->> 'status' is not null
            order by l.created_at desc,
            l.id desc
            limit 1
          ),
          (
            select
              l.old_values ->> 'status'
            from contract_audit_logs l
            where l.contract_id = c.id
            and l.created_at >=(m.month + interval '1 month') at time zone 'America/Santo_Domingo'
            and l.old_values ->> 'status' is not null
            order by l.created_at,
            l.id
            limit 1
          ),
          c.status::text
        ) status
      from months m
      join contracts c on c.created_at <(m.month + interval '1 month') at time zone
      'America/Santo_Domingo'
    )
    select
      to_char(m.month, 'YYYY-MM') as month,
      jsonb_build_object(
        'activeContracts',
        count(s.id) filter (where s.status in ('active', 'expiring_soon')),
        'activeValue',
        coalesce(
          sum(s.contract_value) filter (where s.status in ('active', 'expiring_soon')),
          0
        )::text,
        'contractsAwaitingSignatures',
        count(s.id) filter (where s.status = 'pending_signatures'),
        'pendingSignatures',
        (
          select count(*)
          from contract_signatories signer
          join snapshots x on x.id = signer.contract_id
          and x.month = m.month
          where x.status = 'pending_signatures'
          and (
            signer.signed_at is null
            or signer.signed_at >=(m.month + interval '1 month') at time zone 'America/Santo_Domingo'
          )
        ),
        'avgApprovalDays',
        (
          select
            coalesce(
              avg(extract(epoch from reviewed_at - requested_at) / 86400),
              0
            )
          from contract_approvals
          where status = 'approved'
          and reviewed_at >= m.month at time zone 'America/Santo_Domingo'
          and reviewed_at <(m.month + interval '1 month') at time zone 'America/Santo_Domingo'
        )
      ) metrics
    from months m
    left join snapshots s on s.month = m.month
    group by m.month
    order by m.month
  `);
}

export async function getAdminMonthly(months: number) {
  return await rows(
    sql`
      with months as (
        select
          generate_series(
            ${currentMonth} -(${months} - 1) * interval '1 month',
            ${currentMonth},
            interval '1 month'
          ) as month
      ),
      signed as (
        select
          contract_id,
          min(created_at) signed_at
        from contract_audit_logs
        where new_values ->> 'status' = 'active'
        and (old_values ->> 'status') is distinct from 'active'
        group by contract_id
      )
      select
        to_char(m.month, 'YYYY-MM') as month,
        (
          select count(*)
          from contracts
          where created_at >= m.month at time zone 'America/Santo_Domingo'
          and created_at <(m.month + interval '1 month') at time zone 'America/Santo_Domingo'
        )::int created,
        (
          select count(*)
          from signed
          where signed_at >= m.month at time zone 'America/Santo_Domingo'
          and signed_at <(m.month + interval '1 month') at time zone 'America/Santo_Domingo'
        )::int signed
      from months m
      order by m.month
    `,
  );
}

export async function getAdminStatuses() {
  return await rows<{ status: string; count: number }>(
    sql`
      select
        enumlabel status,
        count(c.id)::int count
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      and t.typname = 'contract_status'
      left join contracts c on c.status::text = e.enumlabel
      group by enumlabel
    `,
  );
}

export async function getAdminUpcomingExpirations() {
  return await rows(
    sql`
      select
        id,
        code,
        title,
        end_date as "endDate",
        contract_value::text as value
      from contracts
      where status in ('active', 'expiring_soon')
      and end_date >= ${santoDomingoToday}
      order by end_date,
      id
      limit 5
    `,
  );
}
