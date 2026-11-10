import { and, eq, sql } from "drizzle-orm";
import type { Transaction } from "../../db/client.js";
import { contracts } from "../../db/schema.js";
import { ApiError } from "../../lib/errors.js";

export async function assertVariableNotReferenced(tx: Transaction, name: string) {
  const referenced = await tx
    .select({ id: contracts.id })
    .from(contracts)
    .where(
      and(
        eq(contracts.archived, false),
        sql`${contracts.status} <> 'cancelled'`,
        sql`exists (select 1 from contract_versions v where v.contract_id = ${contracts.id}
      and (v.snapshot->'variableDefinitions' @> ${JSON.stringify([{ name }])}::jsonb
        or v.variables_data ? ${name}))`,
      ),
    )
    .limit(1);
  if (referenced.length)
    throw new ApiError(
      409,
      "CONFLICT",
      "La variable está referenciada por contratos no cancelados ni archivados.",
    );
}
