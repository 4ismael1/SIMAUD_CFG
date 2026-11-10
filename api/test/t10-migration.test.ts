import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pool, prepareDatabase } from "./database.js";

beforeAll(prepareDatabase);
afterAll(() => pool.end());

it("la migración encadena registros antiguos y el trigger continúa la cadena bajo bloqueo", async () => {
  const client = await pool.connect();
  const schema = "t10_" + randomUUID().replaceAll("-", "");
  try {
    await client.query("begin");
    await client.query(`create schema ${schema}`);
    await client.query(`set local search_path to ${schema}, public`);
    for (const table of ["users", "contracts", "contract_signatories", "contract_audit_logs"])
      await client.query(
        `create table ${table} (like public.${table} including defaults including indexes)`,
      );
    await client.query("alter table users drop column signature_style");
    for (const column of [
      "verification_code",
      "document_sha256",
      "activated_at",
      "revoked_at",
      "system_seal",
      "audit_head",
      "audit_count",
      "evidence_head",
      "evidence_count",
      "ever_signed",
    ])
      await client.query(`alter table contracts drop column ${column}`);
    for (const column of ["chain_contract_id", "sequence", "entry_hash", "previous_hash"])
      await client.query(`alter table contract_audit_logs drop column ${column}`);
    const id = randomUUID();
    await client.query(
      "insert into contracts(id,title,content) values($1,'Histórico','Documento')",
      [id],
    );
    for (const action of ["create", "submit", "approve"])
      await client.query(
        "insert into contract_audit_logs(contract_id,action,entity_type) values($1,$2,'contract')",
        [id, action],
      );
    await client.query(
      "insert into contract_audit_logs(action,entity_type) values('old-global','system')",
    );
    const migration = await readFile(
      new URL("../drizzle/0010_t10_certified_signatures.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await client.query(statement);
    const rows = await client.query<{
      sequence: number;
      entry_hash: string;
      previous_hash: string | null;
      valid: boolean;
    }>(
      "select sequence,entry_hash,previous_hash,entry_hash=t10_audit_hash(to_jsonb(l)) valid from contract_audit_logs l where contract_id=$1 order by sequence",
      [id],
    );
    expect(rows.rows.map((row) => row.sequence)).toEqual([1, 2, 3]);
    expect(rows.rows.every((row) => row.valid)).toBe(true);
    expect(rows.rows[1]!.previous_hash).toBe(rows.rows[0]!.entry_hash);
    expect(rows.rows[2]!.previous_hash).toBe(rows.rows[1]!.entry_hash);
    await client.query(
      "insert into contract_audit_logs(contract_id,action,entity_type) values($1,'sign','contract')",
      [id],
    );
    const head = await client.query<{ audit_count: number; audit_head: string }>(
      "select audit_count,audit_head from contracts where id=$1",
      [id],
    );
    const tail = await client.query<{
      sequence: number;
      entry_hash: string;
      previous_hash: string;
    }>(
      "select sequence,entry_hash,previous_hash from contract_audit_logs where contract_id=$1 order by sequence desc limit 1",
      [id],
    );
    expect(head.rows[0]!.audit_count).toBe(4);
    expect(head.rows[0]!.audit_head).toBe(tail.rows[0]!.entry_hash);
    expect(tail.rows[0]!.previous_hash).toBe(rows.rows[2]!.entry_hash);
    expect(
      (await client.query("select entry_hash from contract_audit_logs where action='old-global'"))
        .rows[0].entry_hash,
    ).toMatch(/^[a-f0-9]{64}$/);
  } finally {
    await client.query("rollback");
    client.release();
  }
});
