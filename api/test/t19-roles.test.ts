import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { cleanDatabase, db, pool, prepareDatabase } from "./helpers.js";
import { testApp, loginUser } from "./t09b-helpers.js";
import { roleFixture, labels, parties } from "./t19-helpers.js";
import {
  contracts,
  contractSignatories,
  contractTemplates,
  templateVariables,
} from "../src/db/schema.js";
import { formatCedula } from "../src/lib/validation/format-cedula.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
});
afterEach(() => app.close());
afterAll(() => pool.end());

it("resuelve tres roles y sus quince variables desde los firmantes, con un testigo opcional", async () => {
  const fixture = await roleFixture(app);
  const response = await fixture.create();
  expect(response.statusCode, response.body).toBe(201);
  const detail = response.json();
  expect(detail.signatories.map((signer: { roleLabel: string }) => signer.roleLabel)).toEqual([
    ...labels,
    "Testigo",
  ]);
  expect(
    detail.signatories.map((signer: { slotIndex: number | null }) => signer.slotIndex),
  ).toEqual([0, 1, 2, null]);
  expect(detail.signatories.map((signer: { signingOrder: number }) => signer.signingOrder)).toEqual(
    [1, 2, 3, 4],
  );
  parties.forEach((party, index) => {
    const person = fixture.people[index]!;
    expect(detail.variablesData).toMatchObject({
      [`${party}_nombre`]: person.name,
      [`${party}_cedula`]: formatCedula(person.cedula),
      [`${party}_email`]: person.email,
      [`${party}_telefono`]: person.phone,
    });
    // The user's job title never fills the contract (owner's decision): cargo is template data.
    expect(detail.variablesData).not.toHaveProperty(`${party}_cargo`);
  });
  expect(JSON.stringify(detail.generatedContent)).toContain(
    formatCedula(fixture.people[0]!.cedula),
  );
  const template = await app.inject({
    url: `/api/v1/templates/${fixture.input.templateId}`,
    headers: fixture.admin.headers,
  });
  expect(template.json()).toMatchObject({
    hasSignatureBlock: true,
    variables: [],
    resolvedVariables: [],
    signatureSlots: parties.map((party, index) => ({
      index,
      label: labels[index],
      party,
      showName: true,
      showId: true,
    })),
  });
  expect(await db.select().from(templateVariables)).toHaveLength(0);
  const withoutWitness = await fixture.create({
    ...fixture.input,
    signatories: fixture.input.signatories.slice(0, 3),
  });
  expect(withoutWitness.statusCode, withoutWitness.body).toBe(201);
  const versions = await app.inject({
    url: `/api/v1/contracts/${detail.id}/versions`,
    headers: fixture.admin.headers,
  });
  expect(versions.json()[0].snapshot.signatories[0]).toMatchObject({
    roleLabel: labels[0],
    slotIndex: 0,
  });
  const audit = await app.inject({
    url: `/api/v1/contracts/${detail.id}/audit`,
    headers: fixture.admin.headers,
  });
  expect(audit.json().data[0].newValues.signatories[0]).toMatchObject({
    roleLabel: labels[0],
    slotIndex: 0,
  });
  const list = await app.inject({ url: "/api/v1/contracts", headers: fixture.admin.headers });
  expect(list.json().data[0].signatories[0]).toMatchObject({ roleLabel: labels[0], slotIndex: 0 });
});

it("rechaza casillas ausentes, repetidas, fuera de rango, extras sin rol testigo y etiquetas del cliente", async () => {
  const { input, create } = await roleFixture(app);
  const cases = [
    input.signatories.slice(1),
    input.signatories.map((signer, index) => ({
      ...signer,
      slotIndex: index === 1 ? 0 : signer.slotIndex,
    })),
    input.signatories.map((signer, index) => ({
      ...signer,
      slotIndex: index === 1 ? 3 : signer.slotIndex,
    })),
    input.signatories.map((signer) => ({ ...signer, slotIndex: null })),
    input.signatories.map((signer, index) =>
      index === 3 ? { ...signer, role: "client" } : signer,
    ),
    input.signatories.map((signer) => ({ ...signer, roleLabel: "EL DUEÑO" })),
  ];
  for (const signatories of cases) {
    const response = await create({ ...input, signatories });
    expect(response.statusCode, response.body).toBe(400);
  }
  expect(await db.select().from(contracts)).toHaveLength(0);
});

it("rechaza valores de party distintos y actualiza las variables al editar o permutar las casillas", async () => {
  const fixture = await roleFixture(app);
  const bad = await fixture.create({
    ...fixture.input,
    variables: { arrendador_nombre: "Nombre inventado" },
  });
  expect(bad.statusCode).toBe(400);
  const created = await fixture.create({
    ...fixture.input,
    variables: { arrendador_nombre: fixture.people[0]!.name },
  });
  expect(created.statusCode, created.body).toBe(201);
  const id = created.json().id as string;
  const outsider = await loginUser(app, { role: "gestor" });
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/v1/contracts/${id}`,
        headers: outsider.headers,
        payload: { title: "Ajeno" },
      })
    ).statusCode,
  ).toBe(404);
  const signatories = fixture.input.signatories.map((signer, index) => ({
    ...signer,
    slotIndex: index === 0 ? 2 : index === 2 ? 0 : signer.slotIndex,
    signingOrder: 4 - index,
  }));
  const patched = await app.inject({
    method: "PATCH",
    url: `/api/v1/contracts/${id}`,
    headers: fixture.admin.headers,
    payload: { signatories },
  });
  expect(patched.statusCode, patched.body).toBe(200);
  expect(patched.json().variablesData.arrendador_nombre).toBe(fixture.people[2]!.name);
  expect(patched.json().variablesData.fiador_nombre).toBe(fixture.people[0]!.name);
  const invalid = await app.inject({
    method: "PATCH",
    url: `/api/v1/contracts/${id}`,
    headers: fixture.admin.headers,
    payload: { signatories: signatories.slice(1) },
  });
  expect(invalid.statusCode).toBe(400);
  expect(
    await db.select().from(contractSignatories).where(eq(contractSignatories.contractId, id)),
  ).toHaveLength(4);
  const content = { type: "doc", content: [{ type: "paragraph" }] };
  expect((await fixture.create({ ...fixture.input, content })).statusCode).toBe(400);
  expect(
    (
      await app.inject({
        method: "PATCH",
        url: `/api/v1/contracts/${id}`,
        headers: fixture.admin.headers,
        payload: { content },
      })
    ).statusCode,
  ).toBe(400);
});

it("el party declarado prevalece sobre variables del catálogo cliente y representante", async () => {
  await db
    .insert(templateVariables)
    .values([{ name: "cliente_nombre", label: "Nombre", type: "text", required: true }]);
  const fixture = await roleFixture(app, ["cliente", "representante", "fiador"]);
  const response = await fixture.create();
  expect(response.statusCode, response.body).toBe(201);
  expect(response.json().variablesData.cliente_nombre).toBe(fixture.people[0]!.name);
  expect(response.json().variablesData.representante_nombre).toBe(fixture.people[1]!.name);
  const [template] = await db
    .select()
    .from(contractTemplates)
    .where(eq(contractTemplates.id, fixture.input.templateId));
  expect(template!.variables).toEqual([]);
  const old = await app.inject({
    method: "POST",
    url: "/api/v1/templates",
    headers: fixture.admin.headers,
    payload: { title: "Legado", content: "Hola {{cliente_nombre}}", contentFormat: "plain" },
  });
  const legacy = await fixture.create({
    ...fixture.input,
    templateId: old.json().id,
    variables: { cliente_nombre: "Cliente manual" },
    signatories: [
      { ...fixture.input.signatories[0], slotIndex: null, role: "client", signingOrder: 1 },
    ],
  });
  expect(legacy.statusCode, legacy.body).toBe(201);
  expect(legacy.json().variablesData.cliente_nombre).toBe("Cliente manual");
});
