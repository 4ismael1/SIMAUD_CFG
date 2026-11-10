import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool, prepareDatabase } from "./helpers.js";
import { trashFile, purgeTrash, withStorageLock } from "../src/lib/storage.js";

beforeAll(prepareDatabase);
afterAll(() => pool.end());

it("mueve sin perder bytes y purga solamente fechas con más de ocho días", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "simaud-t09b-"));
  try {
    await mkdir(path.join(root, "avatars"));
    const filename = path.join(root, "avatars", randomUUID() + ".png");
    await writeFile(filename, "snapshot bytes");
    await trashFile(filename, "2026-11-01", root);
    expect(
      await readFile(path.join(root, ".trash/2026-11-01/avatars", path.basename(filename)), "utf8"),
    ).toBe("snapshot bytes");
    await trashFile(filename, "2026-11-01", root);
    await mkdir(path.join(root, ".trash/2026-10-31"));
    await mkdir(path.join(root, ".trash/manual"));
    expect(await purgeTrash("2026-11-09", root)).toBe(1);
    expect(await readdir(path.join(root, ".trash"))).toEqual(["2026-11-01", "manual"]);
    await expect(
      trashFile(path.join(root, "../outside"), "2026-11-01", root),
    ).rejects.toMatchObject({ reason: "invalid", statusCode: 400, code: "VALIDATION_ERROR" });
  } finally {
    // The resolved temp directory is created by this test and contains no application storage.
    expect(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)).toBe(true);
    await rm(root, { recursive: true });
  }
});

it("el bloqueo de storage excluye una segunda conexión de copia y se libera al fallar", async () => {
  const client = await pool.connect();
  try {
    await expect(
      withStorageLock(async () => {
        const result = await client.query<{ acquired: boolean }>(
          "select pg_try_advisory_lock(10409) as acquired",
        );
        expect(result.rows[0]!.acquired).toBe(false);
        throw new Error("fallo controlado");
      }),
    ).rejects.toThrow("fallo controlado");
    const result = await client.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock(10409) as acquired",
    );
    expect(result.rows[0]!.acquired).toBe(true);
  } finally {
    await client.query("select pg_advisory_unlock(10409)");
    client.release();
  }
});

it("la migración preserva evidencia, aísla vínculos inseguros y rellena definiciones existentes", async () => {
  const migration = await readFile(
    new URL("../drizzle/0008_t09b_contract_security.sql", import.meta.url),
    "utf8",
  );
  const schema = "t09b_" + randomUUID().replaceAll("-", "");
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`create schema ${schema}`));
    await tx.execute(sql.raw(`set local search_path to ${schema}`));
    await tx.execute(
      sql.raw(`
      create table users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create table contract_signatories (id uuid primary key, contract_id uuid, user_id uuid, email text, signature_path text);
      create table contract_versions (id uuid primary key, content text, snapshot jsonb);
      create table template_variables (name text, type text, required boolean, options text[]);
      insert into users values ('00000000-0000-4000-8000-000000000001', 'owner@example.com', now());
      insert into contract_signatories values
        ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000001', 'victim@example.com', 'retained.png'),
        ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000001', 'owner@example.com', null),
        ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000001', 'owner@example.com', null),
        ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000001', ' OWNER@example.com ', null);
      insert into template_variables values ('plan', 'select', true, ARRAY['A']);
      insert into contract_versions values ('00000000-0000-4000-8000-000000000031', 'Plan {{plan}} {{missing}}', '{"title":"Original"}');
    `),
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await tx.execute(sql.raw(statement));
    const reviews = await tx.execute<{
      reason: string;
      original_signatory: { signature_path: string };
    }>(sql.raw("select reason, original_signatory from contract_signatory_binding_review"));
    expect(reviews.rows).toHaveLength(3);
    expect(
      reviews.rows.some((row) => row.original_signatory.signature_path === "retained.png"),
    ).toBe(true);
    const bindings = await tx.execute<{ user_id: string | null }>(
      sql.raw("select user_id from contract_signatories"),
    );
    expect(bindings.rows).toHaveLength(4);
    expect(bindings.rows.filter((row) => row.user_id)).toHaveLength(1);
    const versions = await tx.execute<{ snapshot: unknown }>(
      sql.raw("select snapshot from contract_versions"),
    );
    expect(versions.rows[0]!.snapshot).toMatchObject({
      title: "Original",
      variableDefinitions: [{ name: "plan", type: "select", required: true, options: ["A"] }],
      missingVariableDefinitions: ["missing"],
    });
    await tx.execute(sql.raw(`drop schema ${schema} cascade`));
  });
});
