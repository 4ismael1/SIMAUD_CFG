import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pool, prepareDatabase } from "./database.js";
import { contentDocumentHash } from "../src/lib/rich-doc/content.js";

beforeAll(prepareDatabase);
afterAll(() => pool.end());

it("0017 conserva documentos, hashes, firmas y orden históricos y rellena roles y casillas", async () => {
  const client = await pool.connect();
  const schema = "t19_" + randomUUID().replaceAll("-", "");
  try {
    await client.query("begin");
    await client.query(`create schema ${schema}`);
    await client.query(`set local search_path to ${schema}, public`);
    for (const table of ["users", "contracts", "contract_signatories"])
      await client.query(
        `create table ${table} (like public.${table} including defaults including indexes)`,
      );
    await client.query("alter table users drop column position");
    await client.query("alter table contract_signatories drop column role_label");
    await client.query("alter table contract_signatories drop column slot_index");
    const id = randomUUID();
    const plainId = randomUUID();
    const content =
      '{"type":"doc","content":[{"type":"signatures","content":[{"type":"signatureSlot","attrs":{"label":"EL DUEÑO"}},{"type":"signatureSlot","attrs":{"label":""}}]}]}';
    const hash = contentDocumentHash(content, "rich-v2");
    await client.query(
      "insert into contracts(id,title,content,generated_content,content_format,document_sha256,signed_pdf_path) values($1,'Histórico',$2,$2,'rich-v2',$3,'original.pdf')",
      [id, content, hash],
    );
    await client.query("insert into contracts(id,title,content) values($1,'Plano','Texto')", [
      plainId,
    ]);
    for (const [order, role] of [
      [2, "contractor"],
      [1, "client"],
      [3, "witness"],
    ] as const)
      await client.query(
        "insert into contract_signatories(contract_id,name,email,role,signing_order,status,signature_path) values($1,$2,$3,$4,$5,'signed','historica.png')",
        [id, `Persona ${order}`, `persona${order}@example.com`, role, order],
      );
    await client.query(
      "insert into contract_signatories(contract_id,name,email,role) values($1,'Cliente','cliente@example.com','client')",
      [plainId],
    );
    const migration = await readFile(
      new URL("../drizzle/0017_t19_template_roles.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await client.query(statement);
    const result = await client.query(
      "select name, role_label, slot_index, signing_order, signature_path, status from contract_signatories where contract_id=$1 order by signing_order",
      [id],
    );
    expect(result.rows).toEqual([
      {
        name: "Persona 1",
        role_label: "EL DUEÑO",
        slot_index: 0,
        signing_order: 1,
        signature_path: "historica.png",
        status: "signed",
      },
      {
        name: "Persona 2",
        role_label: "Contratista",
        slot_index: 1,
        signing_order: 2,
        signature_path: "historica.png",
        status: "signed",
      },
      {
        name: "Persona 3",
        role_label: "Testigo",
        slot_index: null,
        signing_order: 3,
        signature_path: "historica.png",
        status: "signed",
      },
    ]);
    const original = (
      await client.query(
        "select content, generated_content, document_sha256, signed_pdf_path from contracts where id=$1",
        [id],
      )
    ).rows[0];
    expect(original).toEqual({
      content,
      generated_content: content,
      document_sha256: hash,
      signed_pdf_path: "original.pdf",
    });
    expect(
      (
        await client.query(
          "select role_label, slot_index from contract_signatories where contract_id=$1",
          [plainId],
        )
      ).rows[0],
    ).toEqual({ role_label: "Cliente", slot_index: null });
    expect(
      (
        await client.query(
          "insert into contract_signatories(contract_id,name,email,role) values($1,'Testigo','testigo@example.com','witness') returning role_label",
          [plainId],
        )
      ).rows[0],
    ).toEqual({ role_label: "Testigo" });
  } finally {
    await client.query("rollback");
    client.release();
  }
});
