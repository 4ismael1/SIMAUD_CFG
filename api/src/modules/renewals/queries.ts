import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { contracts, contractRenewals as renewals, users } from "../../db/schema.js";
import type * as contractService from "../contracts/service.js";
import type { RenewalQuery } from "./schemas.js";
import { santoDomingoToday } from "../../lib/sql.js";

function eligibleScope(actor: contractService.Actor) {
  return sql`
    (
      ${actor.role} in ('admin', 'supervisor')
      or ${contracts.createdBy} = ${actor.id}
      or exists (
        select 1
        from contract_signatories s
        where s.contract_id = ${contracts.id}
        and s.user_id = ${actor.id}
      )
    )
  `;
}

export async function listEligibleRenewals(actor: contractService.Actor) {
  return db
    .select()
    .from(contracts)
    .where(
      and(
        eligibleScope(actor),
        sql`
          ${contracts.status} in ('active', 'expiring_soon', 'expired')
          and not exists (
            select 1
            from contract_renewals r
            where r.original_contract_id = ${contracts.id}
            and (
              r.status = 'pending'
              or (
                r.status = 'approved'
                and exists (
                  select 1
                  from contracts child
                  where child.id = r.new_contract_id
                  and child.status not in ('cancelled', 'renewed')
                )
              )
            )
          )
        `,
      ),
    )
    .orderBy(contracts.endDate, contracts.id);
}

export async function listRenewals(actor: contractService.Actor, query: RenewalQuery) {
  const scope = sql`
    (
      ${actor.role} in ('admin', 'supervisor')
      or (${actor.role} = 'gestor' and ${contracts.createdBy} = ${actor.id})
      or ${renewals.requestedBy} = ${actor.id}
    )
  `;
  const filter = and(
    scope,
    query.status ? eq(renewals.status, query.status) : undefined,
    query.priority ? eq(renewals.priority, query.priority) : undefined,
  );
  const rows = await db
    .select({
      renewal: renewals,
      contract: contracts,
      requester: { id: users.id, name: users.name, email: users.email },
      daysToExpiry: sql<number>`${contracts.endDate} - ${santoDomingoToday}`,
      variationPercent: sql<string>`
        round(
          (${renewals.proposedValue} - ${contracts.contractValue})
            / nullif(${contracts.contractValue}, 0) * 100,
          2
        )::text
      `,
      total: sql<number>`count(*) over()::int`,
    })
    .from(renewals)
    .innerJoin(contracts, eq(contracts.id, renewals.originalContractId))
    .leftJoin(users, eq(users.id, renewals.requestedBy))
    .where(filter)
    .orderBy(sql`${renewals.requestedAt} desc`, renewals.id)
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(renewals)
    .innerJoin(contracts, eq(contracts.id, renewals.originalContractId))
    .where(filter);
  return {
    data: rows.map((row) => ({
      ...row.renewal,
      contract: row.contract,
      requester: row.requester,
      daysToExpiry: row.daysToExpiry,
      currentValue: row.contract.contractValue,
      variationPercent: row.variationPercent,
    })),
    meta: { page: query.page, pageSize: query.pageSize, total: count!.total },
  };
}
