import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pool, prepareDatabase } from "./database.js";
import { env } from "../src/config/env.js";

beforeAll(prepareDatabase);
afterAll(() => pool.end());

it("0014 recupera la autoría histórica y la conserva tras reasignaciones y bajas", async () => {
  const client = await pool.connect();
  const schema = "t16_" + randomUUID().replaceAll("-", "");
  const author = randomUUID();
  const requester = randomUUID();
  const manager = randomUUID();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  try {
    expect(
      (await client.query<{ name: string }>("select current_database() name")).rows[0]!.name,
    ).toBe(decodeURIComponent(new URL(env.DATABASE_URL_TEST!).pathname).slice(1));
    await client.query("begin");
    await client.query(`create schema ${schema}`);
    await client.query(`set local search_path to ${schema}, public`);
    await client.query(`
      create table contracts (id uuid primary key, created_by uuid, signed_pdf_sha256 text);
      create table contract_versions (contract_id uuid, version_number int, created_by uuid);
      create table contract_approvals (id uuid primary key, requested_by uuid);
      create table contract_renewals (id uuid primary key, new_contract_id uuid, requested_by uuid, requested_at timestamptz default now());
      create table contract_audit_logs (id uuid primary key default gen_random_uuid(), chain_contract_id uuid, action text, user_id uuid, old_values jsonb, created_at timestamptz default now());
    `);
    for (const id of ids)
      await client.query("insert into contracts values ($1, $2, null)", [id, manager]);
    await client.query("insert into contract_versions values ($1, 1, $2), ($3, 1, $4)", [
      ids[0],
      author,
      ids[2],
      manager,
    ]);
    await client.query(
      "insert into contract_audit_logs (chain_contract_id, action, old_values) values ($1, 'manager_reassigned', $2)",
      [ids[1], { managerId: requester }],
    );
    await client.query(
      "insert into contract_renewals (id, new_contract_id, requested_by) values ($1, $2, $3)",
      [randomUUID(), ids[2], author],
    );
    await client.query("insert into contract_approvals values ($1, $2)", [randomUUID(), requester]);
    const migration = await readFile(
      new URL("../drizzle/0014_t16_audit_corrections.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await client.query(statement);
    for (const [index, expected] of [author, requester, author].entries())
      expect(
        (
          await client.query("select original_created_by from contracts where id = $1", [
            ids[index],
          ])
        ).rows[0].original_created_by,
      ).toBe(expected);
    await client.query("update contracts set created_by = $1", [requester]);
    await client.query("update contract_approvals set requested_by = null");
    await client.query("update contract_renewals set requested_by = null");
    expect(
      (await client.query("select original_requested_by from contract_approvals")).rows[0]
        .original_requested_by,
    ).toBe(requester);
    expect(
      (await client.query("select original_requested_by from contract_renewals")).rows[0]
        .original_requested_by,
    ).toBe(author);
    for (const [table, column] of [
      ["contracts", "original_created_by"],
      ["contract_approvals", "original_requested_by"],
      ["contract_renewals", "original_requested_by"],
    ]) {
      await client.query("savepoint immutable_origin");
      await expect(client.query(`update ${table} set ${column} = $1`, [manager])).rejects.toThrow(
        "immutable",
      );
      await client.query("rollback to immutable_origin");
    }
    const created = await client.query(
      "insert into contracts (id, created_by) values ($1, $2) returning original_created_by",
      [randomUUID(), author],
    );
    expect(created.rows[0].original_created_by).toBe(author);
  } finally {
    await client.query("rollback");
    client.release();
  }
});
