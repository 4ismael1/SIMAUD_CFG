import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance, HTTPMethods } from "fastify";
import { eq, sql } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import {
  adminAuditLogs,
  contractTemplates,
  templateVariables,
  users,
  settings,
  jobRuns,
} from "../src/db/schema.js";
import { auditStorage } from "../src/modules/audit/service.js";
import { readStorageState, saveStorageState } from "../src/lib/storage-config.js";
import {
  authorization,
  cleanDatabase,
  createUser,
  db,
  pool,
  prepareDatabase,
  signIn,
} from "./helpers.js";

let app: FastifyInstance;
let actorId: string;
let headers: ReturnType<typeof authorization>;
beforeAll(async () => {
  await prepareDatabase();
  app = await buildApp({ logger: false });
});
beforeEach(async () => {
  await cleanDatabase();
  const actor = await createUser({ role: "admin" });
  actorId = actor.id;
  headers = authorization((await signIn(app, actor)).token);
});
afterAll(async () => {
  await app?.close();
  await pool.end();
});
const send = (method: HTTPMethods, path: string, payload?: object) =>
  app.inject({ method, url: "/api/v1" + path, payload, headers });
const logs = () =>
  db
    .select()
    .from(adminAuditLogs)
    .where(eq(adminAuditLogs.actorId, actorId))
    .orderBy(adminAuditLogs.sequence);

it("audita el ciclo de variables y plantillas sin copiar el documento ni opciones", async () => {
  const variable = await send("POST", "/variables", {
    name: "dato",
    label: "Dato",
    type: "text",
    description: "privado-variable",
  });
  expect(variable.statusCode).toBe(201);
  const variableId = variable.json().id;
  expect(
    (await send("PATCH", `/variables/${variableId}`, { label: "Dato actualizado" })).statusCode,
  ).toBe(200);
  const template = await send("POST", "/templates", {
    title: "Plantilla",
    content: "Documento privado",
  });
  expect(template.statusCode).toBe(201);
  const templateId = template.json().id;
  expect(
    (await send("PATCH", `/templates/${templateId}`, { description: "privado-plantilla" }))
      .statusCode,
  ).toBe(200);
  expect(
    (await send("PATCH", `/templates/${templateId}/status`, { status: "inactive" })).statusCode,
  ).toBe(200);
  const duplicate = await send("POST", `/templates/${templateId}/duplicate`);
  expect(duplicate.statusCode).toBe(200);
  expect((await send("DELETE", `/templates/${templateId}`)).statusCode).toBe(200);
  expect((await send("DELETE", `/variables/${variableId}`)).statusCode).toBe(200);
  const entries = await logs();
  expect(entries.map((entry) => entry.action).sort()).toEqual(
    [
      "variable.created",
      "variable.updated",
      "variable.deleted",
      "template.created",
      "template.updated",
      "template.status_changed",
      "template.duplicated",
      "template.deleted",
    ].sort(),
  );
  expect(entries.find((entry) => entry.action === "template.duplicated")!.targetId).toBe(
    duplicate.json().id,
  );
  expect(JSON.stringify(entries)).not.toMatch(
    /Documento privado|privado-variable|privado-plantilla/,
  );
  const feed = await send("GET", `/audit?actorId=${actorId}&area=templates&q=Plantilla`);
  expect(feed.json().meta.total).toBe(5);
});

it("conserva permisos de supervisor para catálogo y restringe el feed al administrador", async () => {
  const supervisor = await createUser({ role: "supervisor" });
  actorId = supervisor.id;
  headers = authorization((await signIn(app, supervisor)).token);
  expect(
    (await send("POST", "/variables", { name: "supervisor", label: "Variable", type: "text" }))
      .statusCode,
  ).toBe(201);
  expect(await logs()).toHaveLength(1);
  expect((await send("GET", "/audit")).statusCode).toBe(403);
});

it("audita ajustes e inicio manual de jobs dentro de sus transacciones", async () => {
  expect(
    (
      await send("PATCH", "/system/settings", {
        expiryWarningDays: 21,
        institution: { name: "Institución", rnc: "privado-rnc", address: "privado-direccion" },
      })
    ).statusCode,
  ).toBe(200);
  expect((await send("POST", "/system/jobs/contract-status/run")).statusCode).toBe(200);
  const entries = await logs();
  expect(entries.map((entry) => entry.action)).toEqual(["settings.updated", "job.started"]);
  expect(JSON.stringify(entries)).not.toMatch(/privado-rnc|privado-direccion/);
  expect((await db.select().from(jobRuns))[0]!.id).toBe(entries[1]!.targetId);
});

it("audita configuración de almacenamiento y filtra credenciales por lista permitida", async () => {
  expect((await send("PUT", "/system/storage", { driver: "disk" })).statusCode).toBe(200);
  await db.transaction((tx) =>
    auditStorage(tx, {
      userId: actorId,
      ip: "192.0.2.2",
      action: "storage:activate",
      entityType: "storage",
      newValues: {
        driver: "disk",
        secretAccessKey: "no-copiar",
        accessKeyId: "tampoco-copiar",
        endpoint: "https://privado.example",
        jobId: "id-operativo",
      },
    }),
  );
  const entries = await logs();
  expect(entries.map((entry) => entry.action)).toEqual(["storage:configure", "storage:activate"]);
  expect(entries[1]!.details).toEqual({ driver: "disk", jobId: "id-operativo" });
  expect(JSON.stringify(entries)).not.toMatch(/no-copiar|tampoco-copiar|privado.example/);
});

it("revierte cambios, correos y sesiones si falla la escritura de auditoría", async () => {
  const target = await createUser();
  const session = authorization((await signIn(app, target)).token);
  await db.execute(
    sql.raw(
      `CREATE FUNCTION t12b_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo de auditoría simulado'; END $$`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE TRIGGER t12b_test_reject_audit BEFORE INSERT ON admin_audit_logs FOR EACH ROW WHEN (NEW.actor_id='${actorId}'::uuid) EXECUTE FUNCTION t12b_test_reject_audit()`,
    ),
  );
  try {
    expect(
      (await send("PATCH", `/users/${target.id}`, { name: "No debe persistir" })).statusCode,
    ).toBe(500);
    expect((await send("POST", `/users/${target.id}/password-reset`)).statusCode).toBe(500);
    expect(
      (await send("POST", "/variables", { name: "rollback", label: "Variable", type: "text" }))
        .statusCode,
    ).toBe(500);
    expect(
      (await send("POST", "/templates", { title: "Rollback", content: "Texto" })).statusCode,
    ).toBe(500);
    expect((await send("PATCH", "/system/settings", { expiryWarningDays: 99 })).statusCode).toBe(
      500,
    );
    expect((await send("POST", "/system/jobs/contract-status/run")).statusCode).toBe(500);
    expect((await db.select().from(users).where(eq(users.id, target.id)))[0]!.name).toBe(
      target.name,
    );
    expect(await db.select().from(contractTemplates)).toHaveLength(0);
    expect(await db.select().from(templateVariables)).toHaveLength(0);
    expect(await db.select().from(settings)).toHaveLength(0);
    expect(await db.select().from(jobRuns)).toHaveLength(0);
    const storageState = await readStorageState();
    await saveStorageState({ ...storageState, pending: storageState.active, migrating: false });
    expect((await send("POST", "/system/storage/migrate")).statusCode).toBeGreaterThanOrEqual(500);
    expect(await db.select().from(jobRuns)).toHaveLength(0);
    const unchangedStorage = await readStorageState();
    expect(unchangedStorage.migrating).toBe(false);
    expect(unchangedStorage.migrationJobId).toBeUndefined();
    const counts = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from email_outbox`,
    );
    expect(counts.rows[0]!.count).toBe(0);
    expect((await app.inject({ url: "/api/v1/me", headers: session })).statusCode).toBe(200);
    expect(await logs()).toHaveLength(0);
  } finally {
    await db.execute(sql`DROP TRIGGER t12b_test_reject_audit ON admin_audit_logs`);
    await db.execute(sql`DROP FUNCTION t12b_test_reject_audit()`);
  }
});
