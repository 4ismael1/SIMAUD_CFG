import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { cleanDatabase, createUser, db, pool, prepareDatabase } from "./helpers.js";
import { seedContracts } from "../src/db/seed-contracts.js";
import { seedSql } from "../src/db/seed-data.js";
import { contractTemplates, contractVersions } from "../src/db/schema.js";
import { canonicalRichDoc } from "../src/lib/rich-doc/schema.js";

beforeAll(prepareDatabase);
beforeEach(cleanDatabase);
afterAll(() => pool.end());

it("añade el ejemplo rich-v1 de forma idempotente y conserva plantillas y versiones plain", async () => {
  for (const role of ["admin", "supervisor", "gestor", "user"] as const) {
    await createUser({ role, email: (role === "user" ? "usuario" : role) + "@simaud.local" });
  }
  await db.execute(sql.raw(seedSql));
  const [original] = await db.select().from(contractTemplates);
  await db.transaction(seedContracts);
  await db.transaction(seedContracts);
  const templates = await db.select().from(contractTemplates);
  expect(templates).toHaveLength(2);
  expect(templates.find((template) => template.id === original!.id)).toEqual(original);
  const rich = templates.find((template) => template.contentFormat === "rich-v1")!;
  expect(rich.variables).toEqual(["cliente_nombre", "valor_contrato"]);
  const document: unknown = JSON.parse(rich.content);
  expect(rich.content).toBe(canonicalRichDoc(document));
  expect(document).toMatchObject({
    content: expect.arrayContaining([
      expect.objectContaining({ type: "heading" }),
      expect.objectContaining({ type: "bulletList" }),
      expect.objectContaining({ type: "table", attrs: { borderless: true } }),
    ]),
  });
  const versions = await db.select().from(contractVersions);
  expect(versions).toHaveLength(8);
  expect(versions.every((version) => version.contentFormat === "plain")).toBe(true);
});
