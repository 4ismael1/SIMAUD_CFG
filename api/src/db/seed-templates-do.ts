/**
 * Loads the Dominican contract templates and their catalog variables. Idempotent: existing variables
 * (same name) and templates (same title) are left untouched, so it can run on any installation.
 *   dev:  npx tsx src/db/seed-templates-do.ts
 *   prod: docker compose … run --rm --no-deps api node dist/db/seed-templates-do.js
 */
import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { db, pool } from "./client.js";
import { contractTemplates, templateVariables, users } from "./schema.js";
import { encodeContent } from "../lib/rich-doc/content.js";
import { resolveVariables } from "../modules/contracts/catalog-variables.js";
import { VARIABLES } from "./templates-do/variables.js";
import { TEMPLATES } from "./templates-do/templates.js";

export async function seedDominicanTemplates() {
  let variablesCreated = 0;
  let templatesCreated = 0;
  await db.transaction(async (tx) => {
    for (const variable of VARIABLES) {
      const [existing] = await tx
        .select({ id: templateVariables.id })
        .from(templateVariables)
        .where(eq(templateVariables.name, variable.name));
      if (existing) continue;
      await tx.insert(templateVariables).values({
        name: variable.name,
        label: variable.label,
        type: variable.type,
        required: variable.required,
        description: variable.description ?? null,
        options: variable.options ?? null,
      });
      variablesCreated++;
    }
    const [admin] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    for (const template of TEMPLATES) {
      const [existing] = await tx
        .select({ id: contractTemplates.id })
        .from(contractTemplates)
        .where(eq(contractTemplates.title, template.title));
      if (existing) continue;
      // Same validation and canonical form as saving from the editor.
      const content = encodeContent(template.content, "rich-v2");
      const { names } = await resolveVariables(tx, content, "rich-v2");
      await tx.insert(contractTemplates).values({
        title: template.title,
        description: template.description,
        category: template.category,
        content,
        contentFormat: "rich-v2",
        variables: names,
        status: "active",
        createdBy: admin?.id ?? null,
      });
      templatesCreated++;
    }
  });
  return { variablesCreated, templatesCreated };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await seedDominicanTemplates();
    console.info(
      `Variables creadas: ${result.variablesCreated}. Plantillas creadas: ${result.templatesCreated}.`,
    );
  } finally {
    await pool.end();
  }
}
