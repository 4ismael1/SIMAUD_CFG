import { sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import type { Actor } from "../contracts/service.js";
import { inPilot, pilotOwners } from "../../lib/pilot.js";

export async function rows<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

export async function object(query: SQL) {
  return (await rows<{ value: Record<string, unknown> }>(query))[0]!.value;
}

export function contractScope(actor: Actor) {
  if (actor.role === "gestor") return sql`c.created_by=${actor.id}`;
  // Pilot mode: own contracts plus the examples.
  if (inPilot(actor))
    return sql`c.created_by in (${sql.join(
      pilotOwners(actor).map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`;
  return sql`true`;
}

/** Pending approvals the actor may decide (also used for counts). */
export function reviewScope(actor: Actor) {
  if (actor.role === "admin") return sql`true`;
  // Supervisors approve any contract (their own included); in pilot mode only their own.
  if (inPilot(actor))
    return sql`(c.created_by = ${actor.id}::uuid or c.original_created_by = ${actor.id}::uuid or a.original_requested_by = ${actor.id}::uuid)`;
  return sql`true`;
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
      and ${reviewScope(actor)}
      order by a.requested_at,
      a.id
      limit 5
    `,
  );
}

export const currentMonth = sql`date_trunc('month',now() at time zone 'America/Santo_Domingo')`;
