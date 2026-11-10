import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  db,
  pool,
  prepareDatabase,
  cleanDatabase,
  createUser,
  testCedula,
  signIn,
  authorization,
} from "./helpers.js";
import { contractSignatories, users } from "../src/db/schema.js";
import { linkSignatories, reconcileSignatories } from "../src/modules/contracts/service.js";
import { contractFixture, testApp } from "./t09b-helpers.js";

beforeAll(prepareDatabase);
beforeEach(cleanDatabase);
afterAll(() => pool.end());

it("la cédula declarada y editada en el perfil no concede acceso a la invitación", async () => {
  const attacker = await createUser();
  const creator = await createUser({ role: "gestor" });
  const contract = await contractFixture(creator.id);
  const invitedCedula = testCedula();
  await db.insert(contractSignatories).values({
    contractId: contract.id,
    name: "Invitada",
    email: "victim@example.com",
    cedula: invitedCedula,
    role: "client",
  });
  await db.transaction((tx) => linkSignatories(tx, attacker));
  await db.update(users).set({ cedula: invitedCedula }).where(eq(users.id, attacker.id));
  await db.transaction((tx) => linkSignatories(tx, attacker));
  expect((await db.select().from(contractSignatories))[0]!.userId).toBeNull();
  const app = await testApp();
  try {
    const login = await signIn(app, attacker);
    const headers = authorization(login.token);
    expect((await app.inject({ url: "/api/v1/me/signatures", headers })).json().data).toEqual([]);
    expect(
      (await app.inject({ url: `/api/v1/contracts/${contract.id}`, headers })).statusCode,
    ).toBe(404);
  } finally {
    await app.close();
  }
});

it("solo un correo confirmado normalizado vincula al invitado, ignorando la cédula", async () => {
  const user = await createUser({ email: "owner@example.com", emailConfirmedAt: null });
  const contract = await contractFixture(user.id);
  await db.insert(contractSignatories).values({
    contractId: contract.id,
    name: "Invitado",
    email: " OWNER@EXAMPLE.COM ",
    cedula: "otra",
    role: "client",
  });
  await db.transaction((tx) => linkSignatories(tx, user));
  expect((await db.select().from(contractSignatories))[0]!.userId).toBeNull();
  await db
    .update(users)
    .set({ emailConfirmedAt: new Date("2026-11-01T00:00:00Z") })
    .where(eq(users.id, user.id));
  // Rechecks the DB identity instead of trusting stale actor data.
  await db.transaction((tx) => linkSignatories(tx, user));
  expect((await db.select().from(contractSignatories))[0]!.userId).toBe(user.id);
});

it("crear o editar exige correo y cédula coincidentes para autocompletar userId", async () => {
  const user = await createUser();
  const creator = await createUser({ role: "gestor" });
  const contract = await contractFixture(creator.id);
  const signer = {
    name: "Invitado",
    email: "different@example.com",
    cedula: user.cedula!,
    role: "client" as const,
    signingOrder: 1,
  };
  await db.transaction((tx) => reconcileSignatories(tx, contract.id, [signer]));
  expect((await db.select().from(contractSignatories))[0]!.userId).toBeNull();
  await db.transaction((tx) =>
    reconcileSignatories(tx, contract.id, [{ ...signer, email: user.email }]),
  );
  expect((await db.select().from(contractSignatories))[0]!.userId).toBe(user.id);
  await db.transaction((tx) => reconcileSignatories(tx, contract.id, [signer]));
  expect((await db.select().from(contractSignatories))[0]!.userId).toBeNull();
});

it("un usuario sin confirmar no se autocompleta y las identidades cruzadas se rechazan", async () => {
  const emailOwner = await createUser();
  const documentOwner = await createUser({ emailConfirmedAt: null });
  const contract = await contractFixture(emailOwner.id);
  const signer = {
    name: "Invitado",
    email: documentOwner.email,
    cedula: documentOwner.cedula!,
    role: "client" as const,
    signingOrder: 1,
  };
  await db.transaction((tx) => reconcileSignatories(tx, contract.id, [signer]));
  expect((await db.select().from(contractSignatories))[0]!.userId).toBeNull();
  await expect(
    db.transaction((tx) =>
      reconcileSignatories(tx, contract.id, [{ ...signer, email: emailOwner.email }]),
    ),
  ).rejects.toMatchObject({ statusCode: 400 });
});

it("el índice impide dos firmantes del mismo usuario y el vínculo perezoso no se duplica", async () => {
  const user = await createUser();
  const contract = await contractFixture(user.id);
  const signer = {
    contractId: contract.id,
    name: user.name,
    email: user.email,
    role: "client" as const,
  };
  await db.insert(contractSignatories).values({ ...signer, userId: user.id });
  await expect(
    db.insert(contractSignatories).values({ ...signer, userId: user.id }),
  ).rejects.toThrow();
  await db.insert(contractSignatories).values(signer);
  await Promise.all([
    db.transaction((tx) => linkSignatories(tx, user)),
    db.transaction((tx) => linkSignatories(tx, user)),
  ]);
  expect(
    (await db.select().from(contractSignatories)).filter((row) => row.userId === user.id),
  ).toHaveLength(1);
  await expect(
    db.transaction((tx) =>
      reconcileSignatories(tx, contract.id, [
        {
          name: user.name,
          email: user.email,
          cedula: user.cedula!,
          role: "client",
          signingOrder: 1,
        },
        {
          name: user.name,
          email: user.email.toUpperCase(),
          cedula: user.cedula!,
          role: "witness",
          signingOrder: 2,
        },
      ]),
    ),
  ).rejects.toThrow("dos veces");
});

it("los vínculos en revisión no vuelven a habilitarse automáticamente", async () => {
  const user = await createUser();
  const contract = await contractFixture(user.id);
  const [signer] = await db
    .insert(contractSignatories)
    .values({ contractId: contract.id, name: user.name, email: user.email, role: "client" })
    .returning();
  await db.execute(
    sql`insert into contract_signatory_binding_review (signatory_id, contract_id, original_user_id, reason, original_signatory) values (${signer!.id}, ${contract.id}, ${user.id}, 'test', '{}'::jsonb)`,
  );
  try {
    await db.transaction((tx) => linkSignatories(tx, user));
    expect((await db.select().from(contractSignatories))[0]!.userId).toBeNull();
  } finally {
    await db.execute(
      sql`delete from contract_signatory_binding_review where signatory_id = ${signer!.id}`,
    );
  }
});
