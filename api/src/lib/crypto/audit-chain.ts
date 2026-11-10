import { sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";

export async function verifyAuditChain(contractId: string, tx: Transaction | typeof db = db) {
  const result = await tx.execute<{ valid: boolean }>(sql`
    select coalesce((select
      c.audit_count = count(a.id) and
      c.audit_head is not distinct from (array_agg(a.entry_hash order by a.sequence desc))[1] and
      coalesce(bool_and(a.entry_hash = t10_audit_hash(to_jsonb(a)) and
        a.contract_id is not distinct from a.chain_contract_id and
        a.sequence = a.expected_sequence and a.previous_hash is not distinct from a.expected_previous), true)
      from contracts c left join (
        select l.*, row_number() over(order by sequence)::int expected_sequence,
          lag(entry_hash) over(order by sequence) expected_previous
        from contract_audit_logs l where chain_contract_id = ${contractId}::uuid
      ) a on true where c.id = ${contractId}::uuid group by c.id), false) valid
  `);
  return result.rows[0]!.valid;
}
