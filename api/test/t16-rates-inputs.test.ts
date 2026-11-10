import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prepareDatabase, cleanDatabase, db, pool, testPassword } from "./helpers.js";
import { testApp, loginUser } from "./t09b-helpers.js";
import { authTokens, emailOutbox } from "../src/db/schema.js";
import { consumeIdentityBudget } from "../src/modules/auth/rate-limit.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
});
afterEach(() => app.close());
afterAll(() => pool.end());

it("comparte el presupuesto normalizado de cuenta entre IPs e instancias sin enumerar cuentas", async () => {
  const other = await testApp();
  try {
    for (let index = 0; index < 5; index++) {
      const response = await (index % 2 ? app : other).inject({
        method: "POST",
        url: "/api/v1/auth/login",
        remoteAddress: `127.0.1.${index + 1}`,
        payload: { email: " Missing@Example.com ", password: "wrong" },
      });
      expect(response.statusCode).toBe(401);
    }
    const blocked = await other.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      remoteAddress: "127.0.2.1",
      payload: { email: "missing@example.com", password: "wrong" },
    });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(
      (
        await consumeIdentityBudget(
          "missing@example.com",
          "login-account",
          5,
          new Date(Date.now() + 61000),
        )
      ).allowed,
    ).toBe(true);
  } finally {
    await other.close();
  }
});

it("repetir recuperación o cambio de correo conserva el enlace y coalesce los envíos", async () => {
  const actor = await loginUser(app);
  for (let index = 0; index < 3; index++) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      remoteAddress: `127.0.3.${index + 1}`,
      payload: { email: actor.user.email },
    });
    expect(response.statusCode).toBe(200);
  }
  expect(await db.select().from(authTokens)).toHaveLength(1);
  expect(await db.select().from(emailOutbox)).toHaveLength(1);
  const blocked = await app.inject({
    method: "POST",
    url: "/api/v1/auth/forgot-password",
    remoteAddress: "127.0.3.8",
    payload: { email: actor.user.email },
  });
  expect(blocked.statusCode).toBe(429);
  for (let index = 0; index < 2; index++)
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/v1/me/email",
          headers: actor.headers,
          payload: { newEmail: "new-address@example.com", password: testPassword },
        })
      ).statusCode,
    ).toBe(200);
  expect(await db.select().from(authTokens)).toHaveLength(2);
  expect(await db.select().from(emailOutbox)).toHaveLength(2);
});

it("rechaza atributos desconocidos y cotas excesivas en cada familia de rutas propia", async () => {
  const admin = await loginUser(app, { role: "admin" });
  for (const url of [
    "/me",
    "/users",
    "/contracts",
    "/contracts/counts",
    "/renewals",
    "/renewals/eligible",
    "/approvals",
    "/notifications",
    "/audit",
    "/dashboard",
    "/system/settings",
  ]) {
    const response = await app.inject({ url: "/api/v1" + url + "?typo=1", headers: admin.headers });
    expect(response.statusCode, url + response.body).toBe(400);
  }
  for (const query of ["page=10001", "pageSize=101", "page=1&page=2", "q=" + "x".repeat(201)])
    expect(
      (await app.inject({ url: "/api/v1/contracts?" + query, headers: admin.headers })).statusCode,
    ).toBe(400);
  for (const path of ["password", "email"])
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/v1/me/" + path,
          headers: admin.headers,
          payload:
            path === "password"
              ? { currentPassword: testPassword, newPassword: "Changed123!", typo: true }
              : { password: testPassword, newEmail: "next@example.com", typo: true },
        })
      ).statusCode,
    ).toBe(400);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          name: "Nombre Prueba",
          email: "register@example.com",
          phone: "8095551234",
          cedula: admin.user.cedula,
          password: testPassword,
          role: "admin",
        },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (await app.inject({ method: "POST", url: "/api/v1/auth/logout", payload: { typo: true } }))
      .statusCode,
  ).toBe(400);
  for (const version of ["0", "1.5", "2147483648"])
    expect(
      (
        await app.inject({
          url: `/api/v1/contracts/00000000-0000-4000-8000-000000000099/versions/${version}`,
          headers: admin.headers,
        })
      ).statusCode,
    ).toBe(400);
});
