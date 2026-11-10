import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pool, prepareDatabase } from "./database.js";

beforeAll(prepareDatabase);
afterAll(() => pool.end());

it("rellena aprobación desde historial y conserva la marca aunque se borre la aprobación vigente", async () => {
  const client = await pool.connect();
  const schema = "t17_" + randomUUID().replaceAll("-", "");
  try {
    await client.query("begin");
    await client.query(`create schema ${schema}`);
    await client.query(`set local search_path to ${schema}, public`);
    for (const table of ["contracts", "contract_approvals", "contract_audit_logs"])
      await client.query(`create table ${table} (like public.${table} including defaults)`);
    await client.query("alter table contracts add primary key(id)");
    await client.query("create table signature_evidence (contract_id uuid)");
    for (const column of [
      "ever_approved",
      "amends_contract_id",
      "amendment_root_id",
      "amended_by_contract_id",
      "amendment_number",
      "amendment_sequence",
      "amendment_reason",
    ])
      await client.query(`alter table contracts drop column ${column}`);
    const ids = Array.from({ length: 6 }, () => randomUUID());
    for (const id of ids)
      await client.query(
        "insert into contracts(id,title,content,status) values($1,'Histórico','Documento','rejected')",
        [id],
      );
    await client.query(
      "insert into contract_approvals(contract_id,version_number,status) values($1,1,'approved')",
      [ids[0]],
    );
    await client.query("update contracts set approved_at=now() where id=$1", [ids[1]]);
    await client.query(
      "insert into contract_audit_logs(chain_contract_id,action,entity_type) values($1,'approved_own','contract')",
      [ids[2]],
    );
    await client.query("insert into signature_evidence(contract_id) values($1)", [ids[5]]);
    const migration = await readFile(
      new URL("../drizzle/0016_t17_amendments.sql", import.meta.url),
      "utf8",
    );
    // The real migration already added the public enum value; isolate all remaining DDL in this schema.
    for (const statement of migration.split("--> statement-breakpoint").slice(1))
      await client.query(statement);
    const markers = await client.query<{ id: string; ever_approved: boolean }>(
      "select id,ever_approved from contracts",
    );
    for (const id of ids.slice(0, 3))
      expect(markers.rows.find((row) => row.id === id)!.ever_approved).toBe(true);
    expect(markers.rows.find((row) => row.id === ids[5])!.ever_approved).toBe(true);
    expect(markers.rows.find((row) => row.id === ids[3])!.ever_approved).toBe(false);
    await client.query("update contracts set approved_at=null, ever_approved=false where id=$1", [
      ids[1],
    ]);
    expect(
      (await client.query("select ever_approved from contracts where id=$1", [ids[1]])).rows[0]
        .ever_approved,
    ).toBe(true);
    await client.query(
      "insert into contract_approvals(contract_id,version_number,status) values($1,1,'approved')",
      [ids[4]],
    );
    expect(
      (await client.query("select ever_approved from contracts where id=$1", [ids[4]])).rows[0]
        .ever_approved,
    ).toBe(true);
    await client.query("delete from contracts where id=$1", [ids[3]]);
    await client.query("savepoint deletion");
    await expect(client.query("delete from contracts where id=$1", [ids[0]])).rejects.toThrow(
      "retained",
    );
    await client.query("rollback to savepoint deletion");
  } finally {
    await client.query("rollback");
    client.release();
  }
});
