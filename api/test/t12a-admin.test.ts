import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { prepareDatabase, cleanDatabase, db, pool } from "./helpers.js";
import { testApp, loginUser, contractFixture } from "./t09b-helpers.js";
import {
  contracts,
  contractAuditLogs,
  contractSignatories,
  notifications,
  users,
} from "../src/db/schema.js";

let app: FastifyInstance;
let admin: Awaited<ReturnType<typeof loginUser>>;
let gestor: typeof admin;
let other: typeof admin;
let supervisor: typeof admin;
let signer: typeof admin;
beforeAll(prepareDatabase);
afterAll(() => pool.end());
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
  admin = await loginUser(app, { role: "admin" });
  gestor = await loginUser(app, { role: "gestor", name: "Responsable exclusivo" });
  other = await loginUser(app, { role: "gestor", name: "Gestor ajeno" });
  supervisor = await loginUser(app, { role: "supervisor" });
  signer = await loginUser(app);
});
afterEach(() => app.close());

function post(path: string, payload: object, actor = admin) {
  return app.inject({
    method: "POST",
    url: "/api/v1/contracts/" + path,
    headers: actor.headers,
    payload,
  });
}

it("reasigna con bloqueo, audita origen/destino/motivo y notifica a ambos gestores", async () => {
  const contract = await contractFixture(gestor.user.id);
  const response = await post(contract.id + "/reassign", {
    managerId: other.user.id,
    reason: "Cambio de responsable",
  });
  expect(response.statusCode, response.body).toBe(200);
  expect(response.json()).toMatchObject({
    id: contract.id,
    createdBy: other.user.id,
    creator: { id: other.user.id },
    can: { reassign: true },
  });
  const [audit] = await db
    .select()
    .from(contractAuditLogs)
    .where(eq(contractAuditLogs.action, "manager_reassigned"));
  expect(audit).toMatchObject({
    userId: admin.user.id,
    contractId: contract.id,
    oldValues: { managerId: gestor.user.id },
    newValues: { managerId: other.user.id, reason: "Cambio de responsable" },
  });
  const notices = await db
    .select()
    .from(notifications)
    .where(eq(notifications.type, "approval_result"));
  expect(notices.map((notice) => notice.userId).sort()).toEqual(
    [gestor.user.id, other.user.id].sort(),
  );
  const oldOwner = await app.inject({
    url: "/api/v1/contracts/" + contract.id,
    headers: gestor.headers,
  });
  expect(oldOwner.statusCode).toBe(404);
});

it("limita la reasignación al admin y valida identidad, actividad y motivo del destino", async () => {
  const contract = await contractFixture(gestor.user.id);
  for (const actor of [gestor, other, supervisor, signer]) {
    expect(
      (
        await post(
          contract.id + "/reassign",
          { managerId: other.user.id, reason: "Cambio de responsable" },
          actor,
        )
      ).statusCode,
    ).toBe(403);
  }
  for (const managerId of [supervisor.user.id, signer.user.id, randomUUID()]) {
    expect(
      (await post(contract.id + "/reassign", { managerId, reason: "Cambio de responsable" }))
        .statusCode,
    ).toBe(400);
  }
  await db.update(users).set({ isActive: false }).where(eq(users.id, other.user.id));
  expect(
    (
      await post(contract.id + "/reassign", {
        managerId: other.user.id,
        reason: "Cambio de responsable",
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await post(contract.id + "/reassign", {
        managerId: gestor.user.id,
        reason: "Cambio de responsable",
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (await post(contract.id + "/reassign", { managerId: other.user.id, reason: "a" })).statusCode,
  ).toBe(400);
  const [persisted] = await db.select().from(contracts).where(eq(contracts.id, contract.id));
  expect(persisted?.createdBy).toBe(gestor.user.id);
  expect(await db.select().from(contractAuditLogs)).toHaveLength(0);
});

it.each([{ status: "cancelled" as const }, { status: "renewed" as const }, { archived: true }])(
  "rechaza reasignación en estados prohibidos: %o",
  async (overrides) => {
    const contract = await contractFixture(gestor.user.id, overrides);
    expect(
      (
        await post(contract.id + "/reassign", {
          managerId: other.user.id,
          reason: "Cambio de responsable",
        })
      ).statusCode,
    ).toBe(409);
    const detail = await app.inject({
      url: "/api/v1/contracts/" + contract.id,
      headers: admin.headers,
    });
    expect(detail.json().can.reassign).toBe(false);
  },
);

it("permite reasignar a otro admin y deniega can.reassign al gestor", async () => {
  const contract = await contractFixture(gestor.user.id);
  const detail = await app.inject({
    url: "/api/v1/contracts/" + contract.id,
    headers: gestor.headers,
  });
  expect(detail.json().can.reassign).toBe(false);
  const response = await post(contract.id + "/reassign", {
    managerId: admin.user.id,
    reason: "Responsabilidad administrativa",
  });
  expect(response.statusCode, response.body).toBe(200);
});

it("rechaza gestores eliminados, contratos inexistentes y motivos mayores de quinientos caracteres", async () => {
  const contract = await contractFixture(gestor.user.id);
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, other.user.id));
  expect(
    (
      await post(contract.id + "/reassign", {
        managerId: other.user.id,
        reason: "Cambio de responsable",
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await post(randomUUID() + "/reassign", {
        managerId: gestor.user.id,
        reason: "Cambio de responsable",
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (await post(contract.id + "/reassign", { managerId: admin.user.id, reason: "a".repeat(501) }))
      .statusCode,
  ).toBe(400);
});

it("limita a diez peticiones masivas por minuto", async () => {
  for (let index = 0; index < 10; index++)
    expect((await post("bulk", { action: "archive", ids: [randomUUID()] })).statusCode).toBe(200);
  expect((await post("bulk", { action: "archive", ids: [randomUUID()] })).statusCode).toBe(429);
});

it("cancela cada contrato en su transacción y continúa después de fallos", async () => {
  const active = await contractFixture(gestor.user.id, { status: "active" });
  const draft = await contractFixture(gestor.user.id, { status: "draft" });
  const pending = await contractFixture(other.user.id);
  const missing = randomUUID();
  const response = await post("bulk", {
    action: "cancel",
    ids: [active.id, draft.id, missing, pending.id],
    reason: "Finalización del convenio",
  });
  expect(response.statusCode, response.body).toBe(200);
  expect(response.json()).toMatchObject({
    succeeded: 2,
    failed: 2,
    results: [
      { id: active.id, code: active.code, ok: true },
      { id: draft.id, code: draft.code, ok: false, error: { code: "CONFLICT" } },
      { id: missing, code: null, ok: false, error: { code: "NOT_FOUND" } },
      { id: pending.id, code: pending.code, ok: true },
    ],
  });
  const audits = await db.select().from(contractAuditLogs);
  expect(audits).toHaveLength(2);
  expect(audits.every((audit) => audit.action === "cancel")).toBe(true);
  expect((await db.select().from(notifications)).length).toBeGreaterThan(0);
  const [unchanged] = await db.select().from(contracts).where(eq(contracts.id, draft.id));
  expect(unchanged?.status).toBe("draft");
});

it("archiva y desarchiva con las mismas validaciones de la acción individual", async () => {
  const contract = await contractFixture(gestor.user.id);
  expect((await post("bulk", { action: "archive", ids: [contract.id] })).json().succeeded).toBe(1);
  expect((await post("bulk", { action: "archive", ids: [contract.id] })).json().failed).toBe(1);
  expect((await post("bulk", { action: "unarchive", ids: [contract.id] })).json().succeeded).toBe(
    1,
  );
  expect((await post("bulk", { action: "unarchive", ids: [contract.id] })).json().failed).toBe(1);
  const [persisted] = await db.select().from(contracts).where(eq(contracts.id, contract.id));
  expect(persisted).toMatchObject({ status: contract.status, archived: false });
});

it("valida límites del lote, unicidad, motivo y permisos sin ofrecer borrado masivo", async () => {
  const contract = await contractFixture(gestor.user.id);
  for (const payload of [
    { action: "cancel", ids: [contract.id] },
    { action: "cancel", ids: [contract.id], reason: " " },
    { action: "archive", ids: [] },
    { action: "archive", ids: [contract.id, contract.id] },
    { action: "archive", ids: [contract.id, contract.id.toUpperCase()] },
    { action: "archive", ids: Array.from({ length: 101 }, () => randomUUID()) },
    { action: "delete", ids: [contract.id] },
  ])
    expect((await post("bulk", payload)).statusCode).toBe(400);
  for (const actor of [gestor, supervisor, signer])
    expect((await post("bulk", { action: "archive", ids: [contract.id] }, actor)).statusCode).toBe(
      403,
    );
});

it("busca cliente, gestor y firmante sin ampliar el alcance del gestor ni interpretar comodines", async () => {
  const own = await contractFixture(gestor.user.id, {
    clientName: "Cliente exclusivo",
    title: "Literal 10%_dato\\fin",
    status: "draft",
    createdAt: new Date("2026-11-01T04:00:00Z"),
  });
  const foreign = await contractFixture(other.user.id, {
    clientName: "Cliente exclusivo",
    status: "active",
  });
  await db.insert(contractSignatories).values(
    [own, foreign].map((contract) => ({
      contractId: contract.id,
      name: "Firmante distintivo",
      cedula: "00112345678",
      email: "test@example.com",
      role: "client" as const,
      signingOrder: 1,
    })),
  );
  const list = async (query: string, actor = gestor) => {
    const response = await app.inject({
      url: "/api/v1/contracts?" + query,
      headers: actor.headers,
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<{ data: Array<{ id: string }>; meta: { total: number } }>();
  };
  for (const q of [
    "Cliente exclusivo",
    "Responsable exclusivo",
    "Firmante distintivo",
    "00112345678",
    "%_dato\\fin",
  ])
    expect((await list("q=" + encodeURIComponent(q))).data.map((row) => row.id)).toEqual([own.id]);
  expect((await list("q=" + encodeURIComponent("Cliente exclusivo"), admin)).meta.total).toBe(2);
  for (const date of ["2026-11-01T03:59:59Z", "2026-11-02T03:59:59Z", "2026-11-02T04:00:00Z"])
    await contractFixture(gestor.user.id, { status: "draft", createdAt: new Date(date) });
  expect(
    (await list("status=draft,active&createdFrom=2026-11-01&createdTo=2026-11-01")).meta.total,
  ).toBe(2);
  expect((await list("status=active")).meta.total).toBe(0);
  expect((await list("createdBy=" + other.user.id)).meta.total).toBe(0);
  expect(
    (
      await app.inject({
        url: "/api/v1/contracts?createdFrom=2026-11-02&createdTo=2026-11-01",
        headers: admin.headers,
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (await app.inject({ url: "/api/v1/contracts?status=unknown", headers: admin.headers }))
      .statusCode,
  ).toBe(400);
});

it("añade campos a los paneles y aísla las series, estados y vencimientos del gestor", async () => {
  const own = await contractFixture(gestor.user.id, {
    status: "active",
    contractValue: "125.25",
    endDate: "2099-01-01",
  });
  await contractFixture(other.user.id, {
    status: "active",
    contractValue: "9000",
    endDate: "2099-01-01",
  });
  await post(own.id + "/reassign", { managerId: admin.user.id, reason: "Cambio para auditoría" });
  await post(own.id + "/reassign", {
    managerId: gestor.user.id,
    reason: "Restauración del responsable",
  });
  const dashboard = async (actor: typeof admin) => {
    const response = await app.inject({ url: "/api/v1/dashboard", headers: actor.headers });
    expect(response.statusCode, response.body).toBe(200);
    return response.json();
  };
  const adminDashboard = await dashboard(admin);
  expect(adminDashboard.totals).toMatchObject({
    users: 5,
    contracts: 2,
    totalValue: 9125.25,
    averageValue: 4562.625,
    approvalRate: null,
  });
  expect(
    adminDashboard.monthly.every((row: { value: number }) => typeof row.value === "number"),
  ).toBe(true);
  expect(adminDashboard.topManagers).toHaveLength(2);
  expect(adminDashboard.usersByRole).toHaveLength(4);
  expect(adminDashboard.recentActivity[0]).toMatchObject({
    action: "manager_reassigned",
    contractId: own.id,
    contractCode: own.code,
    contractTitle: own.title,
  });
  expect(adminDashboard.recentActivity[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  const supervisorDashboard = await dashboard(supervisor);
  expect(supervisorDashboard.catalog).toEqual({
    activeTemplates: 0,
    variables: 0,
    contractsFromTemplates: 0,
  });
  expect(supervisorDashboard.templatesByCategory).toEqual([]);
  expect(supervisorDashboard.recentActivity).toHaveLength(2);
  const gestorDashboard = await dashboard(gestor);
  expect(gestorDashboard.monthly).toHaveLength(12);
  expect(
    gestorDashboard.monthly.reduce((sum: number, row: { value: number }) => sum + row.value, 0),
  ).toBe(125.25);
  expect(
    gestorDashboard.byStatus.find((row: { status: string }) => row.status === "active").count,
  ).toBe(1);
  expect(gestorDashboard.upcomingExpirations.map((row: { id: string }) => row.id)).toEqual([
    own.id,
  ]);
  expect(await dashboard(signer)).not.toHaveProperty("totals");
});
