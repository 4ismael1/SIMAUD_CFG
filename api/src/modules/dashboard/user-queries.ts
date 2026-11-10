import { sql } from "drizzle-orm";
import type { Actor } from "../contracts/service.js";
import { object } from "./queries.js";

export async function getUserDashboard(actor: Actor) {
  return object(sql`
    with mine as (
      select
        c.id,
        c.code,
        c.title,
        c.status,
        s.id "signatoryId",
        s.signed_at "signedAt",
        s.status "signatureStatus",
        s.role_label "roleLabel",
        s.slot_index "slotIndex",
        (
          c.status = 'pending_signatures'
          and s.status = 'pending'
          and not exists (
            select 1
            from contract_signatories lower_signer
            where lower_signer.contract_id = c.id
            and lower_signer.signing_order < s.signing_order
            and lower_signer.status <> 'signed'
          )
        ) "myTurn"
      from contract_signatories s
      join contracts c on c.id = s.contract_id
      where s.user_id = ${actor.id}
    )
    select
      jsonb_build_object(
        'myTurn',
        coalesce(
          (
            select
              jsonb_agg(row)
            from (
              select *
              from mine
              where "myTurn"
              order by code
              limit 50
            ) row
          ),
          '[]'::jsonb
        ),
        'waitingOthers',
        coalesce(
          (
            select
              jsonb_agg(row)
            from (
              select *
              from mine
              where status = 'pending_signatures'
              and not "myTurn"
              and "signatureStatus" = 'pending'
              order by code
              limit 50
            ) row
          ),
          '[]'::jsonb
        ),
        'signed',
        coalesce(
          (
            select
              jsonb_agg(row)
            from (
              select *
              from mine
              where "signatureStatus" = 'signed'
              order by "signedAt" desc
              limit 50
            ) row
          ),
          '[]'::jsonb
        )
      ) value
  `);
}
