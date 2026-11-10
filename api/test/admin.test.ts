import { requestToken, consumeToken } from "../src/modules/auth/service.js";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  db,
  pool,
  prepareDatabase,
  cleanDatabase,
  createUser,
  signIn,
  authorization,
  testPassword,
} from "./helpers.js";
import { emailOutbox, users } from "../src/db/schema.js";
import { createAdmin } from "../src/db/create-admin.js";
import { guardTestDatabase } from "./database.js";
import { loadEnv } from "../src/config/env.js";
import { buildApp } from "../src/app.js";
beforeAll(prepareDatabase);
beforeEach(cleanDatabase);
afterAll(() => pool.end());
const row = async () => (await db.select().from(emailOutbox))[0]!;
it("create-admin es idempotente y exige cambiar contraseña antes de acceder a la API", async () => {
  const input = {
    name: "Administración",
    email: "ADMIN@example.com",
    cedula: "001-1234567-8",
    password: testPassword,
  };
  expect(await createAdmin(input)).toEqual({ created: true, password: undefined });
  expect(await createAdmin(input)).toEqual({ created: false });
  const [admin] = await db.select().from(users);
  expect(admin).toMatchObject({
    role: "admin",
    email: "admin@example.com",
    mustChangePassword: true,
  });
  expect(admin!.emailConfirmedAt).toBeTruthy();
  const app = await buildApp();
  try {
    const session = await signIn(app, admin!);
    expect(session.response.json().user.mustChangePassword).toBe(true);
    const denied = await app.inject({
      url: "/api/v1/system/jobs",
      headers: authorization(session.token),
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    const refresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { cookie: session.cookie },
    });
    expect(refresh.statusCode).toBe(403);
    const unchanged = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/password",
      headers: authorization(session.token),
      payload: { currentPassword: testPassword, newPassword: testPassword },
    });
    expect(unchanged.statusCode).toBe(400);
    const changed = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/password",
      headers: authorization(session.token),
      payload: { currentPassword: testPassword, newPassword: "UpdatedPassword456!" },
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect((await db.select().from(users))[0]!.mustChangePassword).toBe(false);
    expect(
      (await app.inject({ url: "/api/v1/system/jobs", headers: authorization(session.token) }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/logout",
          headers: { cookie: session.cookie },
        })
      ).statusCode,
    ).toBe(200);
  } finally {
    await app.close();
  }
});
it("admin encola prueba y ve pendientes y fallidos; otros roles no acceden", async () => {
  const app = await buildApp();
  try {
    const admin = await createUser({ role: "admin" });
    const session = await signIn(app, admin);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/system/mail/test",
      headers: authorization(session.token),
      payload: { to: "test@example.com" },
    });
    expect(response.statusCode).toBe(202);
    expect((await row()).status).toBe("pending");
    const jobs = await app.inject({
      url: "/api/v1/system/jobs",
      headers: authorization(session.token),
    });
    expect(
      jobs.json().find((job: { name: string }) => job.name === "email-dispatch").outbox,
    ).toEqual({ pending: 1, failed: 0 });
    for (const role of ["user", "gestor", "supervisor"] as const) {
      const other = await signIn(app, await createUser({ role }));
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/system/mail/test",
            headers: authorization(other.token),
            payload: { to: "test@example.com" },
          })
        ).statusCode,
      ).toBe(403);
    }
  } finally {
    await app.close();
  }
});
it("la protección acepta simaud_test2 y rechaza desarrollo aunque cambien host o credenciales", () => {
  const source = {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:example@localhost/simaud_dev",
    DATABASE_URL_TEST: "postgresql://test:example@localhost/simaud_test2",
    JWT_ACCESS_SECRET: "x".repeat(32),
    APP_URL: "https://example.com",
  };
  expect(() => guardTestDatabase(loadEnv(source))).not.toThrow();
  expect(() =>
    guardTestDatabase(loadEnv({ ...source, DATABASE_URL_TEST: source.DATABASE_URL })),
  ).toThrow();
  expect(() =>
    guardTestDatabase(
      loadEnv({ ...source, DATABASE_URL: "postgresql://other:example@127.0.0.1/simaud_test2" }),
    ),
  ).toThrow();
  expect(() => guardTestDatabase(loadEnv({ ...source, NODE_ENV: "development" }))).toThrow();
});

it("create-admin genera contraseña fuerte solo al crear y nunca promueve un email existente", async () => {
  const existing = await createUser({ email: "existing@example.com" });
  expect(
    await createAdmin({ name: "Administración", email: existing.email, cedula: "001-1234567-8" }),
  ).toEqual({ created: false });
  expect((await db.select().from(users))[0]!.role).toBe("user");
  const input = { name: "Administración", email: "generated@example.com", cedula: "002-1234567-8" };
  const results = await Promise.all([createAdmin(input), createAdmin(input)]);
  expect(results.filter((result) => result.created)).toHaveLength(1);
  const created = results.find((result) => result.created)!;
  expect(
    created.password !== undefined &&
      /[A-Z]/.test(created.password) &&
      /[a-z]/.test(created.password) &&
      /[0-9]/.test(created.password) &&
      created.password.length >= 32,
  ).toBe(true);
});

it("recuperar la cuenta exige una contraseña distinta y elimina el bloqueo al cambiarla", async () => {
  await createAdmin({
    name: "Administración",
    email: "reset@example.com",
    cedula: "001-1234567-8",
    password: testPassword,
  });
  await requestToken("reset@example.com", "password_reset");
  const token = (await row()).payload.token!;
  await expect(consumeToken(token, "password_reset", testPassword)).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
  });
  expect((await db.select().from(users))[0]!.mustChangePassword).toBe(true);
  await consumeToken(token, "password_reset", "UpdatedPassword456!");
  expect((await db.select().from(users))[0]!.mustChangePassword).toBe(false);
});
