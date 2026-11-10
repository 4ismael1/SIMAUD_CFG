import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  cleanDatabase,
  db,
  pool,
  prepareDatabase,
  createUser,
  authorization,
  signIn,
} from "./helpers.js";
import { loginUser, testApp } from "./t09b-helpers.js";
import { roleFixture, partyDocument } from "./t19-helpers.js";
import { users, adminAuditLogs, contractTemplates, contracts } from "../src/db/schema.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
});
afterEach(() => app.close());
afterAll(() => pool.end());

it("admin y propio usuario editan cargo, lo reciben en me, usuarios y búsqueda y dejan auditoría", async () => {
  const admin = await loginUser(app, { role: "admin" });
  const person = await loginUser(app);
  const updated = await app.inject({
    method: "PATCH",
    url: `/api/v1/users/${person.user.id}`,
    headers: admin.headers,
    payload: { position: "  Directora  " },
  });
  expect(updated.statusCode, updated.body).toBe(200);
  expect(updated.json().user.position).toBe("Directora");
  const me = await app.inject({ url: "/api/v1/me", headers: person.headers });
  expect(me.json().position).toBe("Directora");
  const own = await app.inject({
    method: "PATCH",
    url: "/api/v1/me",
    headers: person.headers,
    payload: { position: "Asesora" },
  });
  expect(own.statusCode, own.body).toBe(200);
  expect(own.json().user.position).toBe("Asesora");
  const lookup = await app.inject({
    url: `/api/v1/users/lookup?cedula=${person.user.cedula}`,
    headers: admin.headers,
  });
  expect(lookup.json().position).toBe("Asesora");
  const list = await app.inject({ url: "/api/v1/users", headers: admin.headers });
  expect(list.json().data.find((row: { id: string }) => row.id === person.user.id).position).toBe(
    "Asesora",
  );
  const detail = await app.inject({
    url: `/api/v1/users/${person.user.id}`,
    headers: admin.headers,
  });
  expect(detail.json().position).toBe("Asesora");
  const audit = await db
    .select()
    .from(adminAuditLogs)
    .where(eq(adminAuditLogs.targetId, person.user.id));
  expect(audit).toHaveLength(2);
  expect(audit.map((row) => row.details)).toEqual([
    { fields: ["position"] },
    { fields: ["position"] },
  ]);
  for (const payload of [
    { position: "x".repeat(121) },
    { position: 3 },
    { position: "Cargo", id: admin.user.id },
  ])
    expect(
      (await app.inject({ method: "PATCH", url: "/api/v1/me", headers: person.headers, payload }))
        .statusCode,
    ).toBe(400);
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/v1/users/${person.user.id}`,
        headers: admin.headers,
        payload: { position: "x".repeat(121) },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/v1/users/${admin.user.id}`,
        headers: person.headers,
        payload: { position: "Cargo ajeno" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: "/api/v1/me",
        headers: person.headers,
        payload: { position: null },
      })
    ).json().user.position,
  ).toBeNull();
  expect(
    (await db.select().from(users).where(eq(users.id, admin.user.id)))[0]!.position,
  ).toBeNull();
});

it("un cambio de cargo actualiza el borrador al editarlo y un invitado no hereda cargo de otra identidad", async () => {
  const fixture = await roleFixture(app);
  const created = await fixture.create();
  expect(created.statusCode, created.body).toBe(201);
  const id = created.json().id as string;
  const person = fixture.people[0]!;
  const headers = authorization((await signIn(app, person)).token);
  await app.inject({
    method: "PATCH",
    url: "/api/v1/me",
    headers,
    payload: { position: "Cargo nuevo" },
  });
  const [before] = await db.select().from(contracts).where(eq(contracts.id, id));
  expect((before!.variablesData as Record<string, unknown>).arrendador_cargo).toBe("Cargo 0");
  const edited = await app.inject({
    method: "PATCH",
    url: `/api/v1/contracts/${id}`,
    headers: fixture.admin.headers,
    payload: { title: "Cargo actualizado" },
  });
  expect(edited.statusCode, edited.body).toBe(200);
  expect(edited.json().variablesData.arrendador_cargo).toBe("Cargo nuevo");
  const unconfirmed = await createUser({ position: "Privado", emailConfirmedAt: null });
  const absent = await fixture.create({
    ...fixture.input,
    signatories: fixture.input.signatories.map((signer, index) =>
      index === 0 ? { ...signer, email: unconfirmed.email, cedula: unconfirmed.cedula } : signer,
    ),
  });
  expect(absent.statusCode, absent.body).toBe(201);
  expect(absent.json().variablesData.arrendador_cargo).toBe("");
  expect(JSON.stringify(absent.json().generatedContent)).not.toContain('"type":"variable"');
});

it("valida party y etiquetas en contenido nuevo y mantiene legibles y editables los documentos anteriores", async () => {
  const admin = await loginUser(app, { role: "admin" });
  for (const party of ["Persona", "a_b", "", "a".repeat(31)]) {
    const document = partyDocument();
    document.content.at(-1)!.content![0]!.attrs!.party = party;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/templates",
      headers: admin.headers,
      payload: { title: "Inválida", contentFormat: "rich-v2", content: document },
    });
    expect(response.statusCode, response.body).toBe(400);
  }
  const duplicate = partyDocument();
  duplicate.content.at(-1)!.content![1]!.attrs!.party = "arrendador";
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/templates",
        headers: admin.headers,
        payload: { title: "Repetida", contentFormat: "rich-v2", content: duplicate },
      })
    ).statusCode,
  ).toBe(400);
  const content = JSON.stringify({
    type: "doc",
    content: [{ type: "signatures", content: [{ type: "signatureSlot", attrs: { label: "" } }] }],
  });
  const [old] = await db
    .insert(contractTemplates)
    .values({ title: "Histórica", contentFormat: "rich-v2", content })
    .returning();
  expect(
    (await app.inject({ url: `/api/v1/templates/${old!.id}`, headers: admin.headers })).statusCode,
  ).toBe(200);
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/v1/templates/${old!.id}`,
        headers: admin.headers,
        payload: { title: "Metadatos" },
      })
    ).statusCode,
  ).toBe(200);
  for (const label of ["", "   ", "x".repeat(61)]) {
    const document = JSON.parse(content);
    document.content[0].content[0].attrs.label = label;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/templates",
          headers: admin.headers,
          payload: { title: "Nueva", contentFormat: "rich-v2", content: document },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/templates/${old!.id}`,
          headers: admin.headers,
          payload: { content: document },
        })
      ).statusCode,
    ).toBe(400);
  }
});
