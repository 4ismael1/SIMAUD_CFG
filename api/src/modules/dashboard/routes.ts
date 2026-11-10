import type { FastifyInstance } from "fastify";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { authenticate } from "../../plugins/auth.js";
import { parse } from "../contracts/schemas.js";
import type { Actor } from "../contracts/service.js";
async function rows<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}
async function object(query: SQL) {
  return (await rows<{ value: Record<string, unknown> }>(query))[0]!.value;
}
const currentMonth = sql`date_trunc('month',now() at time zone 'America/Santo_Domingo')`;
function contractScope(actor: Actor) {
  return actor.role === "gestor" ? sql`c.created_by=${actor.id}` : sql`true`;
}
async function approvalQueue(actor: Actor) {
  return rows(
    sql`select a.id,a.contract_id as "contractId",c.code,c.title,a.requested_at as "requestedAt",extract(epoch from now()-a.requested_at)/86400 as "ageDays" from contract_approvals a join contracts c on c.id=a.contract_id where a.status='pending' and (${actor.role}='admin' or c.created_by is distinct from ${actor.id}::uuid) order by a.requested_at,a.id limit 5`,
  );
}
export async function adminDashboard(actor: Actor, months: number) {
  const attention = await object(sql`select jsonb_build_object(
    'pendingApprovals',(select count(*) from contract_approvals where status='pending'),
    'oldestPendingDays',(select coalesce(floor(extract(epoch from now()-min(requested_at))/86400),0)::int from contract_approvals where status='pending'),
    'expiring30',(select count(*) from contracts where status in ('active','expiring_soon') and end_date between (now() at time zone 'America/Santo_Domingo')::date and (now() at time zone 'America/Santo_Domingo')::date+30),
    'urgentRenewals',(select count(*) from contract_renewals where status='pending' and priority='urgent')) value`);
  const current = await object(sql`select jsonb_build_object(
    'activeContracts',count(*) filter(where status in ('active','expiring_soon')),
    'activeValue',coalesce(sum(contract_value) filter(where status in ('active','expiring_soon')),0)::text,
    'contractsAwaitingSignatures',count(*) filter(where status='pending_signatures'),
    'pendingSignatures',(select count(*) from contract_signatories s join contracts p on p.id=s.contract_id where p.status='pending_signatures' and s.status='pending'),
    'avgApprovalDays',(select coalesce(avg(extract(epoch from reviewed_at-requested_at)/86400),0) from contract_approvals where status='approved' and reviewed_at>=${currentMonth})) value from contracts`);
  const history = await rows<{ month: string; metrics: Record<string, unknown> }>(sql`
    with months as (select generate_series(${currentMonth}-interval '6 months',${currentMonth}-interval '1 month',interval '1 month') as month),
    snapshots as (select m.month,c.id,coalesce((select (l.new_values->>'contractValue')::numeric from contract_audit_logs l where l.contract_id=c.id and l.created_at < (m.month+interval '1 month') at time zone 'America/Santo_Domingo' and l.new_values->>'contractValue' is not null order by l.created_at desc,l.id desc limit 1), (select (l.old_values->>'contractValue')::numeric from contract_audit_logs l where l.contract_id=c.id and l.created_at >= (m.month+interval '1 month') at time zone 'America/Santo_Domingo' and l.old_values->>'contractValue' is not null order by l.created_at,l.id limit 1),c.contract_value) contract_value,coalesce((select l.new_values->>'status' from contract_audit_logs l where l.contract_id=c.id and l.created_at < (m.month+interval '1 month') at time zone 'America/Santo_Domingo' and l.new_values->>'status' is not null order by l.created_at desc,l.id desc limit 1),
      (select l.old_values->>'status' from contract_audit_logs l where l.contract_id=c.id and l.created_at >= (m.month+interval '1 month') at time zone 'America/Santo_Domingo' and l.old_values->>'status' is not null order by l.created_at,l.id limit 1),c.status::text) status
      from months m join contracts c on c.created_at < (m.month+interval '1 month') at time zone 'America/Santo_Domingo')
    select to_char(m.month,'YYYY-MM') as month,jsonb_build_object(
      'activeContracts',count(s.id) filter(where s.status in ('active','expiring_soon')),
      'activeValue',coalesce(sum(s.contract_value) filter(where s.status in ('active','expiring_soon')),0)::text,
      'contractsAwaitingSignatures',count(s.id) filter(where s.status='pending_signatures'),
      'pendingSignatures',(select count(*) from contract_signatories signer join snapshots x on x.id=signer.contract_id and x.month=m.month where x.status='pending_signatures' and (signer.signed_at is null or signer.signed_at >= (m.month+interval '1 month') at time zone 'America/Santo_Domingo')),
      'avgApprovalDays',(select coalesce(avg(extract(epoch from reviewed_at-requested_at)/86400),0) from contract_approvals where status='approved' and reviewed_at>=m.month at time zone 'America/Santo_Domingo' and reviewed_at<(m.month+interval '1 month') at time zone 'America/Santo_Domingo')) metrics
      from months m left join snapshots s on s.month=m.month group by m.month order by m.month`);
  const kpis = Object.fromEntries(
    Object.entries(current).map(([key, value]) => [
      key,
      {
        value,
        previous: history.at(-1)!.metrics[key],
        trend: [...history.slice(1).map((row) => row.metrics[key]), value],
      },
    ]),
  );
  const monthly = await rows(
    sql`with months as (select generate_series(${currentMonth}-(${months}-1)*interval '1 month',${currentMonth},interval '1 month') as month), signed as (select contract_id,min(created_at) signed_at from contract_audit_logs where new_values->>'status'='active' and (old_values->>'status') is distinct from 'active' group by contract_id) select to_char(m.month,'YYYY-MM') as month,(select count(*) from contracts where created_at>=m.month at time zone 'America/Santo_Domingo' and created_at<(m.month+interval '1 month') at time zone 'America/Santo_Domingo')::int created,(select count(*) from signed where signed_at>=m.month at time zone 'America/Santo_Domingo' and signed_at<(m.month+interval '1 month') at time zone 'America/Santo_Domingo')::int signed from months m order by m.month`,
  );
  const statuses = await rows<{ status: string; count: number }>(
    sql`select enumlabel status, count(c.id)::int count from pg_enum e join pg_type t on t.oid=e.enumtypid and t.typname='contract_status' left join contracts c on c.status::text=e.enumlabel group by enumlabel`,
  );
  const upcomingExpirations = await rows(
    sql`select id,code,title,end_date as "endDate",contract_value::text as value from contracts where status in ('active','expiring_soon') and end_date>=(now() at time zone 'America/Santo_Domingo')::date order by end_date,id limit 5`,
  );
  return {
    attention,
    kpis,
    monthly,
    byStatus: Object.fromEntries(statuses.map((row) => [row.status, row.count])),
    pendingApprovals: await approvalQueue(actor),
    upcomingExpirations,
  };
}
async function supervisorDashboard(actor: Actor) {
  const kpis = await object(sql`select jsonb_build_object(
    'toReview',(select count(*) from contract_approvals a join contracts c on c.id=a.contract_id where a.status='pending' and c.created_by is distinct from ${actor.id}::uuid),
    'approvedThisMonth',count(*) filter(where status='approved'),
    'returnedThisMonth',count(*) filter(where status='rejected'),
    'returnRate',coalesce(round(100.0*count(*) filter(where status='rejected')/nullif(count(*),0),2),0),
    'myAvgResponseDays',coalesce(avg(extract(epoch from reviewed_at-requested_at)/86400),0)) value from contract_approvals where reviewed_by=${actor.id} and reviewed_at>=${currentMonth} at time zone 'America/Santo_Domingo'`);
  const templateUsage = await rows(
    sql`select t.id "templateId",t.title,count(c.id)::int count from contract_templates t left join contracts c on c.template_id=t.id group by t.id,t.title order by count(c.id) desc,t.id`,
  );
  const myRecentDecisions = await rows(
    sql`select a.id,a.contract_id "contractId",c.title,c.code,a.status,a.comments,a.reviewed_at "reviewedAt" from contract_approvals a join contracts c on c.id=a.contract_id where a.reviewed_by=${actor.id} order by a.reviewed_at desc,a.id limit 5`,
  );
  return { kpis, queue: await approvalQueue(actor), templateUsage, myRecentDecisions };
}
async function gestorDashboard(actor: Actor) {
  const scope = contractScope(actor);
  const kpis =
    await object(sql`with first_reviews as (select distinct on(contract_id) contract_id,status from contract_approvals where status<>'pending' order by contract_id,requested_at,id)
    select jsonb_build_object('myActive',count(*) filter(where c.status in ('active','expiring_soon')),'myValue',coalesce(sum(c.contract_value) filter(where c.status in ('active','expiring_soon')),0)::text,
    'pendingSignatures',(select count(*) from contract_signatories s join contracts c on c.id=s.contract_id where ${scope} and c.status='pending_signatures' and s.status='pending'),
    'firstTimeApprovalRate',(select coalesce(round(100.0*count(*) filter(where f.status='approved')/nullif(count(*),0),2),0) from first_reviews f join contracts c on c.id=f.contract_id where ${scope}),
    'institutionFirstTimeApprovalRate',(select coalesce(round(100.0*count(*) filter(where status='approved')/nullif(count(*),0),2),0) from first_reviews)) value from contracts c where ${scope}`);
  const lanes = await object(sql`select jsonb_build_object(
    'returned',coalesce((select jsonb_agg(row) from (select c.id,c.code,c.title,c.rejection_reason "returnComment",(select count(*) from contract_signatories s where s.contract_id=c.id and status='signed') "signed",(select count(*) from contract_signatories s where s.contract_id=c.id) total from contracts c where ${scope} and c.status='rejected' order by c.updated_at desc,c.id limit 20) row),'[]'::jsonb),
    'drafts',coalesce((select jsonb_agg(row) from (select c.id,c.code,c.title from contracts c where ${scope} and status='draft' order by updated_at desc,id limit 20) row),'[]'::jsonb),
    'awaitingSignatures',coalesce((select jsonb_agg(row) from (select c.id,c.code,c.title,(select count(*) from contract_signatories s where s.contract_id=c.id and status='signed') signed,(select count(*) from contract_signatories s where s.contract_id=c.id) total from contracts c where ${scope} and status='pending_signatures' order by updated_at desc,id limit 20) row),'[]'::jsonb)) value`);
  const recent = await rows(
    sql`select c.id,c.code,c.title,c.status,c.contract_value::text value,c.updated_at "updatedAt" from contracts c where ${scope} order by c.updated_at desc,c.id limit 5`,
  );
  return { kpis, lanes, recent };
}
async function userDashboard(actor: Actor) {
  return object(sql`with mine as (select c.id,c.code,c.title,c.status,s.id "signatoryId",s.signed_at "signedAt",s.status "signatureStatus",(c.status='pending_signatures' and s.status='pending' and not exists(select 1 from contract_signatories lower_signer where lower_signer.contract_id=c.id and lower_signer.signing_order<s.signing_order and lower_signer.status<>'signed')) "myTurn" from contract_signatories s join contracts c on c.id=s.contract_id where s.user_id=${actor.id}) select jsonb_build_object(
    'myTurn',coalesce((select jsonb_agg(row) from(select * from mine where "myTurn" order by code limit 50) row),'[]'::jsonb),
    'waitingOthers',coalesce((select jsonb_agg(row) from(select * from mine where status='pending_signatures' and not "myTurn" and "signatureStatus"='pending' order by code limit 50) row),'[]'::jsonb),
    'signed',coalesce((select jsonb_agg(row) from(select * from mine where "signatureStatus"='signed' order by "signedAt" desc limit 50) row),'[]'::jsonb)) value`);
}
export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard", { preHandler: authenticate }, async (req) => {
    const { months } = parse(
      z
        .object({
          months: z.coerce
            .number()
            .refine((value) => value === 6 || value === 12)
            .default(6),
        })
        .strict(),
      req.query,
    );
    if (req.user.role === "admin") return adminDashboard(req.user, months);
    if (req.user.role === "supervisor") return supervisorDashboard(req.user);
    if (req.user.role === "gestor") return gestorDashboard(req.user);
    return userDashboard(req.user);
  });
}
