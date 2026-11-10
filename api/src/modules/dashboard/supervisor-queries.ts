import { sql } from "drizzle-orm";
import type { Actor } from "../contracts/service.js";
import { rows, object, currentMonth } from "./queries.js";

export async function getSupervisorKpis(actor: Actor) {
  return await object(sql`
    select
      jsonb_build_object(
        'toReview',
        (
          select count(*)
          from contract_approvals a
          join contracts c on c.id = a.contract_id
          where a.status = 'pending'
          and c.created_by is distinct from ${actor.id}::uuid
        ),
        'approvedThisMonth',
        count(*) filter (where status = 'approved'),
        'returnedThisMonth',
        count(*) filter (where status = 'rejected'),
        'returnRate',
        coalesce(
          round(
            100.0 * count(*) filter (where status = 'rejected') / nullif(count(*), 0),
            2
          ),
          0
        ),
        'myAvgResponseDays',
        coalesce(
          avg(extract(epoch from reviewed_at - requested_at) / 86400),
          0
        )
      ) value
    from contract_approvals
    where reviewed_by = ${actor.id}
    and reviewed_at >= ${currentMonth} at time zone 'America/Santo_Domingo'
  `);
}

export async function getSupervisorTemplateUsage() {
  return await rows(
    sql`
      select
        t.id "templateId",
        t.title,
        count(c.id)::int count
      from contract_templates t
      left join contracts c on c.template_id = t.id
      group by t.id,
      t.title
      order by count(c.id) desc,
      t.id
    `,
  );
}

export async function getSupervisorMyRecentDecisions(actor: Actor) {
  return await rows(
    sql`
      select
        a.id,
        a.contract_id "contractId",
        c.title,
        c.code,
        a.status,
        a.comments,
        a.reviewed_at "reviewedAt"
      from contract_approvals a
      join contracts c on c.id = a.contract_id
      where a.reviewed_by = ${actor.id}
      order by a.reviewed_at desc,
      a.id
      limit 5
    `,
  );
}
