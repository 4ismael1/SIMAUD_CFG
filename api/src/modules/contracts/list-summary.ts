import { sql } from "drizzle-orm";
import { contracts } from "../../db/schema.js";
import type { Actor } from "./service.js";

export function summaryColumns(actor: Actor) {
  // Explicit SQL qualification survives Drizzle's single-table selection rewriting.
  const contractId = sql`"contracts"."id"`;
  return {
    id: contracts.id,
    code: contracts.code,
    title: contracts.title,
    status: contracts.status,
    contractValue: contracts.contractValue,
    currency: contracts.currency,
    startDate: contracts.startDate,
    endDate: contracts.endDate,
    createdAt: contracts.createdAt,
    updatedAt: contracts.updatedAt,
    archived: contracts.archived,
    creator: sql<{ id: string; name: string } | null>`(
      select json_build_object('id', u.id, 'name', u.name)
      from users u where u.id = ${contracts.createdBy}
    )`,
    signatory: sql<{
      id: string;
      name: string;
      role: string;
      roleLabel: string;
      slotIndex: number | null;
      signingOrder: number;
      status: string;
      signedAt: string | null;
    } | null>`(
      select json_build_object('id', s.id, 'name', s.name, 'role', s.role,
        'roleLabel', s.role_label, 'slotIndex', s.slot_index,
        'signingOrder', s.signing_order, 'status', s.status, 'signedAt', s.signed_at)
      from contract_signatories s where s.contract_id = ${contractId} and s.user_id = ${actor.id}
    )`,
    myTurn: sql<boolean>`(${contracts.status} = 'pending_signatures' and exists (
      select 1 from contract_signatories s
      where s.contract_id = ${contractId} and s.user_id = ${actor.id} and s.status = 'pending'
      and not exists (select 1 from contract_signatories earlier
        where earlier.contract_id = s.contract_id and earlier.signing_order < s.signing_order
        and earlier.status <> 'signed')
    ))`,
    signatures: sql<{ signed: number; total: number }>`(
      select json_build_object('signed', count(*) filter (where s.status = 'signed'), 'total', count(*))
      from contract_signatories s where s.contract_id = ${contractId}
    )`,
  };
}
