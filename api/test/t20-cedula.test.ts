import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { cleanDatabase, db, pool, prepareDatabase } from "./helpers.js";
import { loginUser, testApp } from "./t09b-helpers.js";
import { roleFixture } from "./t19-helpers.js";
import { signingFixture } from "./t17-helpers.js";
import { contracts, contractSignatories, contractApprovals } from "../src/db/schema.js";
import { storage } from "../src/lib/storage.js";
import { missingCedula } from "../src/modules/contracts/cedula.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
});
afterEach(() => app.close());
afterAll(() => pool.end());

it("POST y PATCH exigen cédula válida por campo también a los testigos y conservan los datos al fallar", async () => {
  const fixture = await roleFixture(app);
  const created = await fixture.create();
  expect(created.statusCode, created.body).toBe(201);
  const id = created.json().id as string;
  for (const index of [0, 3]) {
    for (const cedula of [undefined, null, "", "   ", "00000000000", "00113918206"]) {
      const signatories = fixture.input.signatories.map((signer, position) =>
        position === index ? { ...signer, cedula } : signer,
      );
      for (const method of ["POST", "PATCH"] as const) {
        const response = await app.inject({
          method,
          url: `/api/v1/contracts${method === "PATCH" ? `/${id}` : ""}`,
          headers: fixture.admin.headers,
          payload: method === "POST" ? { ...fixture.input, signatories } : { signatories },
        });
        expect(response.statusCode, response.body).toBe(400);
        expect(response.json().error).toMatchObject({
          code: "VALIDATION_ERROR",
          details: expect.arrayContaining([
            expect.objectContaining({ field: `signatories.${index}.cedula` }),
          ]),
        });
      }
    }
  }
  expect(await db.select().from(contracts)).toHaveLength(1);
  const detail = await app.inject({
    url: `/api/v1/contracts/${id}`,
    headers: fixture.admin.headers,
  });
  expect(detail.json()).toMatchObject({
    currentVersion: 1,
    signatories: created.json().signatories,
    missingCedula: [],
    can: { submit: true },
  });
});

it("normaliza cédulas con guiones al crear y editar y sigue rechazando duplicados", async () => {
  const fixture = await roleFixture(app);
  const signatories = fixture.input.signatories.map((signer) => ({
    ...signer,
    cedula: signer.cedula.replace(/^(\d{3})(\d{7})(\d)$/, "$1-$2-$3"),
  }));
  const created = await fixture.create({ ...fixture.input, signatories });
  expect(created.statusCode, created.body).toBe(201);
  const id = created.json().id as string;
  const edited = await app.inject({
    method: "PATCH",
    url: `/api/v1/contracts/${id}`,
    headers: fixture.admin.headers,
    payload: { signatories },
  });
  expect(edited.statusCode, edited.body).toBe(200);
  expect(edited.json().signatories.map((signer: { cedula: string }) => signer.cedula)).toEqual(
    fixture.people.map((person) => person.cedula),
  );
  const duplicate = await app.inject({
    method: "PATCH",
    url: `/api/v1/contracts/${id}`,
    headers: fixture.admin.headers,
    payload: {
      signatories: signatories.map((signer) => ({ ...signer, cedula: signatories[0]!.cedula })),
    },
  });
  expect(duplicate.statusCode, duplicate.body).toBe(400);
});

it.each(["draft", "rejected"] as const)(
  "un contrato antiguo %s sin cédula se lee y edita sin firmantes pero no se envía ni por override",
  async (status) => {
    const fixture = await roleFixture(app);
    const created = await fixture.create();
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id as string;
    await db.update(contracts).set({ status }).where(eq(contracts.id, id));
    await db
      .update(contractSignatories)
      .set({ cedula: null })
      .where(eq(contractSignatories.contractId, id));
    const edited = await app.inject({
      method: "PATCH",
      url: `/api/v1/contracts/${id}`,
      headers: fixture.admin.headers,
      payload: { title: "Título histórico corregido" },
    });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json()).toMatchObject({
      status: "draft",
      missingCedula: fixture.people.map((person) => person.name),
      can: { submit: false, edit: true },
    });
    expect(
      edited
        .json()
        .signatories.every((signer: { cedula: string | null }) => signer.cedula === null),
    ).toBe(true);
    if (status === "rejected")
      await db.update(contracts).set({ status }).where(eq(contracts.id, id));
    const supervisor = await loginUser(app, { role: "supervisor" });
    const outsider = await loginUser(app, { role: "gestor" });
    for (const [headers, expected] of [
      [supervisor.headers, 403],
      [outsider.headers, 404],
    ] as const) {
      const forbidden = await app.inject({
        method: "POST",
        url: `/api/v1/contracts/${id}/submit`,
        headers,
        payload: {},
      });
      expect(forbidden.statusCode).toBe(expected);
      expect(forbidden.body).not.toContain("Falta la cédula");
    }
    for (const action of ["submit", "override-status"]) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/contracts/${id}/${action}`,
        headers: fixture.admin.headers,
        payload: action === "submit" ? {} : { status: "pending_approval", reason: "Revisión" },
      });
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json().error).toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining(`Falta la cédula de ${fixture.people[0]!.name}`),
      });
    }
    expect(await db.select().from(contractApprovals)).toHaveLength(0);
    const [current] = await db.select().from(contracts).where(eq(contracts.id, id));
    expect(current).toMatchObject({ status, currentVersion: 2 });
  },
);

it.each(["enmienda", "renovación"])(
  "crea la %s histórica sin cédula y bloquea submit hasta completarla, conservando la verificación original",
  async (kind) => {
    const fixture = await signingFixture(app, 1);
    await db
      .update(contractSignatories)
      .set({ cedula: null })
      .where(eq(contractSignatories.contractId, fixture.contract.id));
    const original = await fixture.seal();
    const bytes = await storage.get("contracts/" + original.signedPdfPath);
    const verified = await app.inject({ url: `/api/v1/verify/${original.verificationCode}` });
    expect(verified.statusCode, verified.body).toBe(200);
    expect(verified.json()).toMatchObject({
      status: "registered",
      evidenceChainValid: true,
      systemSignatureValid: true,
      pdfIntegrityValid: true,
    });
    const created = await app.inject({
      method: "POST",
      url: kind === "enmienda" ? `/api/v1/contracts/${original.id}/amendments` : "/api/v1/renewals",
      headers: fixture.admin.headers,
      payload:
        kind === "enmienda"
          ? { reason: "Corregir cláusula" }
          : {
              contractId: original.id,
              proposedStartDate: "2027-11-01",
              proposedEndDate: "2028-11-01",
              proposedValue: "100.00",
              reason: "Renovar",
            },
    });
    expect(created.statusCode, created.body).toBe(201);
    let childId = created.json().id as string;
    if (kind === "renovación") {
      const approved = await app.inject({
        method: "POST",
        url: `/api/v1/renewals/${childId}/approve`,
        headers: fixture.admin.headers,
        payload: {},
      });
      expect(approved.statusCode, approved.body).toBe(200);
      childId = approved.json().newContractId as string;
    }
    const detail = await app.inject({
      url: `/api/v1/contracts/${childId}`,
      headers: fixture.admin.headers,
    });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json()).toMatchObject({
      status: "draft",
      missingCedula: [fixture.actors[0]!.user.name],
      can: { submit: false },
      signatories: [expect.objectContaining({ cedula: null })],
    });
    const blocked = await app.inject({
      method: "POST",
      url: `/api/v1/contracts/${childId}/submit`,
      headers: fixture.admin.headers,
      payload: {},
    });
    expect(blocked.statusCode, blocked.body).toBe(409);
    expect(blocked.json().error.message).toContain(
      `Falta la cédula de ${fixture.actors[0]!.user.name}`,
    );
    expect(
      await db.select().from(contractApprovals).where(eq(contractApprovals.contractId, childId)),
    ).toHaveLength(0);
    const person = fixture.actors[0]!.user;
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/contracts/${childId}`,
      headers: fixture.admin.headers,
      payload: {
        signatories: [
          {
            name: "Firmante histórico",
            email: person.email,
            cedula: person.cedula,
            role: "client",
            signingOrder: 1,
          },
        ],
      },
    });
    expect(patched.statusCode, patched.body).toBe(200);
    expect(patched.json()).toMatchObject({ missingCedula: [], can: { submit: true } });
    const submitted = await app.inject({
      method: "POST",
      url: `/api/v1/contracts/${childId}/submit`,
      headers: fixture.admin.headers,
      payload: {},
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json().status).toBe("pending_approval");
    const originalDetail = await app.inject({
      url: `/api/v1/contracts/${original.id}`,
      headers: fixture.admin.headers,
    });
    expect(originalDetail.json().signatories[0].cedula).toBeNull();
    expect(await storage.get("contracts/" + original.signedPdfPath)).toEqual(bytes);
    const verifiedAfter = await app.inject({ url: `/api/v1/verify/${original.verificationCode}` });
    expect(verifiedAfter.json()).toEqual(verified.json());
    expect(verifiedAfter.json()).not.toHaveProperty("missingCedula");
  },
);

it("usa el ID si falta el nombre histórico y reconoce cédulas vacías", () => {
  expect(
    missingCedula([
      { id: "sin-nombre", name: " ", cedula: null },
      { id: "vacío", name: "Testigo", cedula: " " },
      { id: "completo", name: "Firmante", cedula: "00113918205" },
    ]),
  ).toEqual(["sin-nombre", "Testigo"]);
});
