import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { emailOutbox, users } from "../src/db/schema.js";
import {
  authorization,
  cleanDatabase,
  createUser,
  db,
  pool,
  prepareDatabase,
  signIn,
  testPassword,
} from "./helpers.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await buildApp({ logger: false });
});
afterEach(() => app.close());
afterAll(() => pool.end());
const input = {
  name: "Persona nueva",
  email: "new@example.com",
  cedula: "00113918205",
  phone: "8095551234",
  password: testPassword,
};
const post = (route: string, payload: object, ip = "127.0.0.1") =>
  app.inject({ method: "POST", url: "/api/v1/auth/" + route, payload, remoteAddress: ip });

it("registro devuelve idéntico 202 sin datos para email nuevo, email existente y cédula ocupada", async () => {
  const fresh = await post("register", { ...input, role: "admin" });
  const existing = await post("register", {
    ...input,
    email: " NEW@EXAMPLE.COM ",
    cedula: "40200700678",
  });
  const document = await post("register", { ...input, email: "another@example.com" });
  for (const response of [fresh, existing, document]) {
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ message: "Revisa tu correo." });
    expect(response.body).toBe(fresh.body);
  }
  const accounts = await db.select().from(users);
  expect(accounts).toHaveLength(1);
  expect(accounts[0]!.role).toBe("user");
  expect(accounts[0]!.passwordHash.startsWith("$argon2id$")).toBe(true);
  const mails = await db.select().from(emailOutbox);
  expect(mails).toHaveLength(2);
  expect(mails.find((mail) => mail.template === "account_exists")).toMatchObject({
    to: input.email,
  });
  expect(
    mails.find((mail) => mail.template === "email_confirmation")!.encryptedPayload !== null,
  ).toBe(true);
});

it("registros simultáneos no revelan conflictos ni sobrescriben la cuenta", async () => {
  const results = await Promise.all([
    post("register", input),
    post("register", { ...input, name: "Otro nombre" }),
  ]);
  expect(results.map((response) => response.statusCode)).toEqual([202, 202]);
  expect(results[0]!.body).toBe(results[1]!.body);
  expect(await db.select().from(users)).toHaveLength(1);
});

it("la disponibilidad pública de email y cédula ya no existe", async () => {
  await createUser({ email: input.email, cedula: input.cedula });
  for (const query of [
    "?email=new@example.com",
    "?cedula=00113918205",
    "?email=missing@example.com",
    "",
  ]) {
    const response = await app.inject("/api/v1/auth/availability" + query);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "No se encontró el recurso." },
    });
  }
});

it("login agota 20 intentos por IP aunque cambien los emails y conserva otra IP", async () => {
  const user = await createUser();
  for (let index = 0; index < 20; index++)
    expect(
      (await post("login", { email: `missing${index}@example.com`, password: "wrong" })).statusCode,
    ).toBe(401);
  const blocked = await post("login", { email: user.email, password: testPassword });
  expect(blocked.statusCode).toBe(429);
  expect(blocked.json().error.code).toBe("RATE_LIMITED");
  expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  const other = await signIn(app, user, testPassword, "127.0.0.2");
  expect(
    (await app.inject({ url: "/api/v1/me", headers: authorization(other.token) })).statusCode,
  ).toBe(200);
});

it("el límite de 5 por IP y email normalizado sigue siendo independiente", async () => {
  for (let index = 0; index < 5; index++)
    expect(
      (await post("login", { email: "missing@example.com", password: "wrong" })).statusCode,
    ).toBe(401);
  expect(
    (await post("login", { email: " MISSING@EXAMPLE.COM ", password: "wrong" })).statusCode,
  ).toBe(429);
  expect(
    (await post("login", { email: "another@example.com", password: "wrong" })).statusCode,
  ).toBe(401);
  expect(
    (await post("login", { email: "missing@example.com", password: "wrong" }, "127.0.0.2"))
      .statusCode,
  ).toBe(401);
});

it("registro, recuperación y reenvío comparten presupuesto agregado por IP", async () => {
  for (const route of ["forgot-password", "resend-confirmation"])
    for (let index = 0; index < 3; index++)
      expect((await post(route, { email: "missing@example.com" })).statusCode).toBe(200);
  for (let index = 0; index < 4; index++)
    expect(
      (await post("register", { ...input, email: `new${index}@example.com` })).statusCode,
    ).toBe(202);
  expect((await post("register", { ...input, email: "last@example.com" })).statusCode).toBe(429);
  expect((await post("register", input, "127.0.0.2")).statusCode).toBe(202);
});
