import { inArray } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { templateVariables as variables } from "../../db/schema.js";
import { ApiError } from "../../lib/errors.js";
import { contentVariables } from "../../lib/rich-doc/content.js";
import type { ContentFormat } from "../../lib/rich-doc/types.js";
import { partyDefinitions } from "../../lib/rich-doc/slots.js";

export async function resolveVariables(
  tx: Transaction | typeof db,
  content: string,
  format: ContentFormat = "plain",
) {
  const implicit = partyDefinitions(content, format);
  const names = contentVariables(content, format).filter(
    (name) => !implicit.some((definition) => definition.name === name),
  );
  const defs = names.length
    ? await tx.select().from(variables).where(inArray(variables.name, names))
    : [];
  const unknown = names.filter(
    (versionNumber) => !defs.some((variable) => variable.name === versionNumber),
  );
  if (unknown.length)
    throw new ApiError(400, "VALIDATION_ERROR", "Variables desconocidas.", { unknown });
  return { names, defs, implicit };
}
