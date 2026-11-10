import { sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";

export async function verifyAdminAuditChain(connection: Transaction | typeof db = db) {
  const result = await connection.execute<{ valid: boolean }>(sql`
    with entries as (
      select *, row_number() over(order by sequence) expected,
        lag(entry_hash) over(order by sequence) previous,
        t12b_audit_hash(to_jsonb(l)) calculated from admin_audit_logs l
    )
    select coalesce((select bool_and(sequence=expected and entry_hash=calculated
      and previous_hash is not distinct from previous) from entries), true)
      and h.sequence=(select count(*) from entries)
      and h.entry_hash is not distinct from
        (select entry_hash from entries order by sequence desc limit 1) as valid
    from admin_audit_head h where id=1
  `);
  return result.rows[0]?.valid === true;
}
