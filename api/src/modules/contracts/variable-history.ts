import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "../../db/client.js";
import { contractVersions } from "../../db/schema.js";
import { ApiError } from "../../lib/errors.js";
import { contentVariables } from "../../lib/rich-doc/content.js";
import type { ContentFormat } from "../../lib/rich-doc/types.js";
import { resolveVariables } from "./catalog.js";
import type { Contract } from "./service.js";

const definitionSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  options: z.array(z.string()).nullable(),
});
export type VariableDefinition = z.infer<typeof definitionSchema>;

export async function lockVariableCatalog(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(10404)`);
}

export async function captureDefinitions(
  tx: Transaction,
  content: string,
  format: ContentFormat = "plain",
): Promise<VariableDefinition[]> {
  await lockVariableCatalog(tx);
  const { defs } = await resolveVariables(tx, content, format);
  return defs.map(({ name, type, required, options }) => ({ name, type, required, options }));
}

export async function historicalDefinitions(tx: Transaction, contract: Contract) {
  const [version] = await tx
    .select({ snapshot: contractVersions.snapshot })
    .from(contractVersions)
    .where(
      and(
        eq(contractVersions.contractId, contract.id),
        eq(contractVersions.versionNumber, contract.currentVersion),
      ),
    );
  const parsed = z
    .object({ variableDefinitions: z.array(definitionSchema) })
    .safeParse(version?.snapshot);
  const names = contentVariables(contract.content, contract.contentFormat);
  if (
    !parsed.success ||
    names.some(
      (name) => !parsed.data.variableDefinitions.some((definition) => definition.name === name),
    )
  )
    throw new ApiError(
      409,
      "CONFLICT",
      "Faltan definiciones históricas de variables; solicita revisión del contrato.",
    );
  return parsed.data.variableDefinitions;
}
