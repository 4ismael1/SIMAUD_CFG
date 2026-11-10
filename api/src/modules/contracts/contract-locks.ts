import { inArray, sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { contracts } from "../../db/schema.js";

export async function lockContractRows(connection: Transaction | typeof db, ids: string[]) {
  if (!ids.length) return [];
  const resources = await connection.execute<{ id: string }>(sql`
    with recursive related as (
      select id, parent_contract_id from contracts
      where id in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      union
      select parent.id, parent.parent_contract_id from contracts parent
      join related child on parent.id = child.parent_contract_id
    ) select id from related
  `);
  if (!resources.rows.length) return [];
  // Nested renewal activation must never acquire an earlier ancestor after a child.
  return connection
    .select()
    .from(contracts)
    .where(
      inArray(
        contracts.id,
        resources.rows.map((resource) => resource.id),
      ),
    )
    .orderBy(contracts.id)
    .for("update");
}
