import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { cleanDatabase, db, pool, prepareDatabase } from "./helpers.js";
import { contractFixture, loginUser, testApp } from "./t09b-helpers.js";
import {
  contractApprovals,
  contractTemplates,
  notifications,
  templateVariables,
} from "../src/db/schema.js";
import { invalidatePilotCache } from "../src/lib/pilot.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  invalidatePilotCache();
  app = await testApp();
});
afterEach(() => app.close());
afterAll(() => pool.end());

async function setup() {
  const admin = await loginUser(app, { role: "admin" });
  const ana = await loginUser(app, { role: "supervisor", name: "Ana Estudiante" });
  const beto = await loginUser(app, { role: "supervisor", name: "Beto Estudiante" });
  const own = await contractFixture(ana.user.id, { title: "De Ana", status: "pending_approval" });
  const other = await contractFixture(beto.user.id, {
    title: "De Beto",
    status: "pending_approval",
  });
  const example = await contractFixture(admin.user.id, { title: "Ejemplo", status: "active" });
  for (const [contract, by] of [
    [own, ana.user.id],
    [other, beto.user.id],
  ] as const)
    await db
      .insert(contractApprovals)
      .values({ contractId: contract.id, versionNumber: 1, requestedBy: by });
  const pilot = (enabled: boolean) =>
    app.inject({
      method: "PATCH",
      url: "/api/v1/system/settings",
      headers: admin.headers,
      payload: { pilot: { enabled, exampleUserIds: [] } },
    });
  const get = (who: typeof ana, url: string) =>
    app.inject({ url: "/api/v1" + url, headers: who.headers });
  return { admin, ana, beto, own, other, example, pilot, get };
}

it("modo pilotaje: cada supervisor ve solo lo suyo y los ejemplos; al apagarlo vuelve a verlo todo", async () => {
  const { ana, own, other, example, pilot, get } = await setup();
  expect((await pilot(true)).statusCode).toBe(200);

  const titles = (await get(ana, "/contracts"))
    .json()
    .data.map((c: { title: string }) => c.title)
    .sort();
  expect(titles).toEqual(["De Ana", "Ejemplo"]);
  expect((await get(ana, "/contracts/" + other.id)).statusCode).toBe(404);
  // The example is visible but read-only for the student.
  const ex = (await get(ana, "/contracts/" + example.id)).json();
  expect(ex.can).toMatchObject({ cancel: false, archive: false, edit: false });
  expect((await get(ana, "/contracts/counts")).json().pending_approval).toBe(1);

  // Approvals: only their own request, and they cannot decide someone else's.
  const queue = (await get(ana, "/approvals")).json();
  expect(queue.map((item: { contractId: string }) => item.contractId)).toEqual([own.id]);
  const approveOther = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${other.id}/approve`,
    headers: ana.headers,
    payload: {},
  });
  expect(approveOther.statusCode).toBe(404);
  const approveOwn = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${own.id}/approve`,
    headers: ana.headers,
    payload: {},
  });
  expect(approveOwn.statusCode, approveOwn.body).toBe(200);

  // Dashboard queue too.
  const dashResponse = await get(ana, "/dashboard");
  expect(dashResponse.statusCode, dashResponse.body).toBe(200);
  const dash = dashResponse.json();
  expect(dash.queue.map((item: { contractId: string }) => item.contractId)).not.toContain(other.id);

  expect((await pilot(false)).statusCode).toBe(200);
  expect((await get(ana, "/contracts/" + other.id)).statusCode).toBe(200);
  expect((await get(ana, "/contracts")).json().data).toHaveLength(3);
});

it("modo pilotaje: plantillas y variables ajenas no se pueden modificar; las de ejemplo se pueden duplicar", async () => {
  const { admin, ana, beto, pilot } = await setup();
  await pilot(true);
  const [exampleTemplate] = await db
    .insert(contractTemplates)
    .values({
      title: "Plantilla ejemplo",
      content: "Texto",
      createdBy: admin.user.id,
      status: "active",
    })
    .returning();
  const [betoTemplate] = await db
    .insert(contractTemplates)
    .values({
      title: "Plantilla de Beto",
      content: "Texto",
      createdBy: beto.user.id,
      status: "active",
    })
    .returning();

  const listed = (await app.inject({ url: "/api/v1/templates", headers: ana.headers }))
    .json()
    .map((t: { title: string }) => t.title);
  expect(listed).toContain("Plantilla ejemplo");
  expect(listed).not.toContain("Plantilla de Beto");
  expect(
    (await app.inject({ url: "/api/v1/templates/" + betoTemplate!.id, headers: ana.headers }))
      .statusCode,
  ).toBe(404);
  const edit = await app.inject({
    method: "PATCH",
    url: "/api/v1/templates/" + exampleTemplate!.id,
    headers: ana.headers,
    payload: { title: "Cambiada" },
  });
  expect(edit.statusCode).toBe(403);
  const copy = await app.inject({
    method: "POST",
    url: `/api/v1/templates/${exampleTemplate!.id}/duplicate`,
    headers: ana.headers,
    payload: {},
  });
  expect(copy.statusCode, copy.body).toBe(200);

  const created = await app.inject({
    method: "POST",
    url: "/api/v1/variables",
    headers: beto.headers,
    payload: { name: "dato_de_beto", label: "Dato de Beto", type: "text" },
  });
  expect(created.statusCode, created.body).toBe(201);
  const [variable] = await db
    .select()
    .from(templateVariables)
    .where(eq(templateVariables.name, "dato_de_beto"));
  expect(variable!.createdBy).toBe(beto.user.id);
  const touch = await app.inject({
    method: "PATCH",
    url: "/api/v1/variables/" + variable!.id,
    headers: ana.headers,
    payload: { label: "Mío" },
  });
  expect(touch.statusCode).toBe(403);
  const own = await app.inject({
    method: "PATCH",
    url: "/api/v1/variables/" + variable!.id,
    headers: beto.headers,
    payload: { label: "Dato de Beto (editado)" },
  });
  expect(own.statusCode, own.body).toBe(200);
});

it("modo pilotaje: enviar a aprobación avisa solo a quien creó el contrato", async () => {
  const { ana, beto, pilot } = await setup();
  await pilot(true);
  const draft = await contractFixture(ana.user.id, { title: "Borrador de Ana", status: "draft" });
  await db.delete(notifications);
  const submit = await app.inject({
    method: "POST",
    url: `/api/v1/contracts/${draft.id}/submit`,
    headers: ana.headers,
    payload: {},
  });
  expect(submit.statusCode, submit.body).toBe(200);
  const sent = await db
    .select()
    .from(notifications)
    .where(eq(notifications.type, "approval_needed"));
  expect(sent.map((n) => n.userId)).toEqual([ana.user.id]);
  expect(sent.some((n) => n.userId === beto.user.id)).toBe(false);
});
