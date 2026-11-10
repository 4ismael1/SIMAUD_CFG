import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { pool, prepareDatabase, cleanDatabase } from "./helpers.js";
import { loginUser, testApp } from "./t09b-helpers.js";
import { signatureMethod } from "../src/modules/contracts/signature-style.js";
import { loadEnv } from "../src/config/env.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
});
afterEach(() => app.close());
afterAll(() => pool.end());

it("guarda solo la preferencia propia, valida texto y fuente y permite olvidarla", async () => {
  const first = await loginUser(app);
  const second = await loginUser(app);
  const url = "/api/v1/me/signature-style";
  expect((await app.inject({ url, headers: first.headers })).statusCode).toBe(404);
  expect((await app.inject({ url })).statusCode).toBe(401);
  const saved = await app.inject({
    method: "PUT",
    url,
    headers: first.headers,
    payload: { text: "  María Ñúñez O'Leary-S.  ", fontId: "allura" },
  });
  expect(saved.json()).toEqual({ text: "María Ñúñez O'Leary-S.", fontId: "allura" });
  expect((await app.inject({ url, headers: first.headers })).json()).toEqual(saved.json());
  expect((await app.inject({ url, headers: second.headers })).statusCode).toBe(404);
  for (const text of ["", " ", "A".repeat(61), "Ana123", "<script>", "😀", "..."])
    expect(
      (
        await app.inject({
          method: "PUT",
          url,
          headers: first.headers,
          payload: { text, fontId: "allura" },
        })
      ).statusCode,
    ).toBe(400);
  expect(
    (
      await app.inject({
        method: "PUT",
        url,
        headers: first.headers,
        payload: { text: "Ana", fontId: "external" },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await app.inject({
        method: "PUT",
        url,
        headers: first.headers,
        payload: { text: "Ana", fontId: "allura", image: "forbidden" },
      })
    ).statusCode,
  ).toBe(400);
  expect((await app.inject({ method: "DELETE", url, headers: first.headers })).statusCode).toBe(
    200,
  );
  expect((await app.inject({ url, headers: first.headers })).statusCode).toBe(404);
});

it("valida method/fontId y conserva unknown para clientes anteriores", () => {
  expect(signatureMethod.parse({})).toEqual({ method: "unknown" });
  for (const input of [
    { method: "typed" },
    { method: "drawn", fontId: "allura" },
    { fontId: "allura" },
    { method: "uploaded", fontId: "allura" },
    { method: "other" },
    { method: "typed", fontId: "external" },
  ])
    expect(signatureMethod.safeParse(input).success).toBe(false);
  expect(signatureMethod.parse({ method: "typed", fontId: "allura" })).toEqual({
    method: "typed",
    fontId: "allura",
  });
});

it("producción exige las rutas de clave y certificado sin imprimir sus valores", () => {
  const source = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://test:test@localhost/simaud",
    JWT_ACCESS_SECRET: "x".repeat(32),
    APP_URL: "https://example.test",
    MAIL_DRIVER: "smtp",
    SMTP_URL: "smtp://localhost",
    MAIL_FROM: "test@example.test",
    MAIL_PAYLOAD_KEY: "11".repeat(32),
    SETTINGS_ENCRYPTION_KEY: "22".repeat(32),
  };
  expect(() => loadEnv(source)).toThrow("SIGNING_KEY_PATH y SIGNING_CERT_PATH");
  expect(
    loadEnv({
      ...source,
      SIGNING_KEY_PATH: "/run/secrets/key",
      SIGNING_CERT_PATH: "/run/secrets/cert",
    }).SIGNATURE_BACKFILL_PENDING,
  ).toBe(false);
});
