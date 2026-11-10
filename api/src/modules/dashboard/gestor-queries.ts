import { sql, type SQL } from "drizzle-orm";

import { rows, object } from "./queries.js";

export async function getGestorKpis(scope: SQL) {
  return await object(sql`
    with first_reviews as (
      select
        distinct on (contract_id) contract_id,
        status
      from contract_approvals
      where status <> 'pending'
      order by contract_id,
      requested_at,
      id
    )
    select
      jsonb_build_object(
        'myActive',
        count(*) filter (where c.status in ('active', 'expiring_soon')),
        'myValue',
        coalesce(
          sum(c.contract_value) filter (where c.status in ('active', 'expiring_soon')),
          0
        )::text,
        'pendingSignatures',
        (
          select count(*)
          from contract_signatories s
          join contracts c on c.id = s.contract_id
          where ${scope}
          and c.status = 'pending_signatures'
          and s.status = 'pending'
        ),
        'firstTimeApprovalRate',
        (
          select
            coalesce(
              round(
                100.0 * count(*) filter (where f.status = 'approved') / nullif(count(*), 0),
                2
              ),
              0
            )
          from first_reviews f
          join contracts c on c.id = f.contract_id
          where ${scope}
        ),
        'institutionFirstTimeApprovalRate',
        (
          select
            coalesce(
              round(
                100.0 * count(*) filter (where status = 'approved') / nullif(count(*), 0),
                2
              ),
              0
            )
          from first_reviews
        )
      ) value
    from contracts c
    where ${scope}
  `);
}

export async function getGestorLanes(scope: SQL) {
  return await object(sql`
    select
      jsonb_build_object(
        'returned',
        coalesce(
          (
            select
              jsonb_agg(row)
            from (
              select
                c.id,
                c.code,
                c.title,
                c.rejection_reason "returnComment",
                (
                  select count(*)
                  from contract_signatories s
                  where s.contract_id = c.id
                  and status = 'signed'
                ) "signed",
                (
                  select count(*)
                  from contract_signatories s
                  where s.contract_id = c.id
                ) total
              from contracts c
              where ${scope}
              and c.status = 'rejected'
              order by c.updated_at desc,
              c.id
              limit 20
            ) row
          ),
          '[]'::jsonb
        ),
        'drafts',
        coalesce(
          (
            select
              jsonb_agg(row)
            from (
              select
                c.id,
                c.code,
                c.title
              from contracts c
              where ${scope}
              and status = 'draft'
              order by updated_at desc,
              id
              limit 20
            ) row
          ),
          '[]'::jsonb
        ),
        'awaitingSignatures',
        coalesce(
          (
            select
              jsonb_agg(row)
            from (
              select
                c.id,
                c.code,
                c.title,
                (
                  select count(*)
                  from contract_signatories s
                  where s.contract_id = c.id
                  and status = 'signed'
                ) signed,
                (
                  select count(*)
                  from contract_signatories s
                  where s.contract_id = c.id
                ) total
              from contracts c
              where ${scope}
              and status = 'pending_signatures'
              order by updated_at desc,
              id
              limit 20
            ) row
          ),
          '[]'::jsonb
        )
      ) value
  `);
}

export async function getGestorRecent(scope: SQL) {
  return await rows(
    sql`
      select
        c.id,
        c.code,
        c.title,
        c.status,
        c.contract_value::text value,
        c.updated_at "updatedAt"
      from contracts c
      where ${scope}
      order by c.updated_at desc,
      c.id
      limit 5
    `,
  );
}
