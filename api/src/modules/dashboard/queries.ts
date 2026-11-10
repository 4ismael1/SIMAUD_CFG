import { sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import type { Actor } from "../contracts/service.js";

export async function rows<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

export async function object(query: SQL) {
  return (await rows<{ value: Record<string, unknown> }>(query))[0]!.value;
}

export function contractScope(actor: Actor) {
  return actor.role === "gestor" ? sql`c.created_by=${actor.id}` : sql`true`;
}

export async function approvalQueue(actor: Actor) {
  return rows(
    sql`
      select
        a.id,
        a.contract_id as "contractId",
        c.code,
        c.title,
        a.requested_at as "requestedAt",
        extract(epoch from now() - a.requested_at) / 86400 as "ageDays"
      from contract_approvals a
      join contracts c on c.id = a.contract_id
      where a.status = 'pending'
      and (
        ${actor.role} = 'admin'
        or c.created_by is distinct from ${actor.id}::uuid
      )
      order by a.requested_at,
      a.id
      limit 5
    `,
  );
}

export const currentMonth = sql`date_trunc('month',now() at time zone 'America/Santo_Domingo')`;
