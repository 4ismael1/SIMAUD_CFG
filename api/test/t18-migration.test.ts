import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pool, prepareDatabase } from "./database.js";
beforeAll(prepareDatabase);
afterAll(() => pool.end());

it("migra códigos históricos como legacy sin cambiar código, sello o hash, y permite evidencia sucesora", async () => {
  const client = await pool.connect();
  const schema = "t18_" + randomUUID().replaceAll("-", "");
  try {
    await client.query("begin");
    await client.query(`create schema ${schema}`);
    await client.query(`set local search_path to ${schema}, public`);
    await client.query(
      "create table contracts (id uuid primary key, verification_code text, signed_pdf_sha256 text, system_seal jsonb)",
    );
    await client.query("create table contract_signatories (id uuid primary key)");
    await client.query(
      "create table signature_evidence (signatory_id uuid, contract_version integer, unique(signatory_id, contract_version))",
    );
    const id = randomUUID();
    const code = "SIM-1234-5678-9ABC-DEF0-1234";
    await client.query(
      "insert into contracts values ($1,$2,'hash-conservado','{\"signature\":\"sello-conservado\"}')",
      [id, code],
    );
    const migration = await readFile(
      new URL("../drizzle/0015_t18_verification_placement.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await client.query(statement);
    expect((await client.query("select * from verification_codes")).rows).toEqual([
      { code: code.replaceAll("-", ""), contract_id: id, legacy: true, revoked: false },
    ]);
    expect((await client.query("select * from contracts")).rows).toEqual([
      {
        id,
        verification_code: code,
        signed_pdf_sha256: "hash-conservado",
        system_seal: { signature: "sello-conservado" },
      },
    ]);
    await client.query("insert into signature_evidence values ($1,1),($1,1)", [randomUUID()]);
    expect((await client.query("select count(*)::int n from signature_evidence")).rows[0].n).toBe(
      2,
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});
