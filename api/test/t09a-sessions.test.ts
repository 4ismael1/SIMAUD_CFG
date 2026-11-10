import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { decodeJwt } from "jose";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { authTokens, refreshTokens, users } from "../src/db/schema.js";
import { createAccessToken } from "../src/lib/auth/jwt.js";
import { issueAuthToken, lockUser, tokenHash } from "../src/modules/auth/service.js";
import { decryptPayload, payloadContext } from "../src/lib/mail/payload.js";
import { emailOutbox } from "../src/db/schema.js";
import {
  authorization,
  cleanDatabase,
  cookie,
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
const post = (path: string, headers: Record<string, string> = {}, payload: object = {}) =>
  app.inject({ method: "POST", url: "/api/v1/auth/" + path, headers, payload });
const me = (token: string) => app.inject({ url: "/api/v1/me", headers: authorization(token) });
async function resetToken(user: Awaited<ReturnType<typeof createUser>>) {
  await db.transaction(async (tx) => {
    const locked = await lockUser(tx, user.id);
    await issueAuthToken(tx, locked!, "password_reset");
  });
  const rows = await db.select().from(emailOutbox);
  const mail = rows.at(-1)!;
  return decryptPayload(mail.encryptedPayload!, payloadContext(mail.to, mail.template)).token!;
}

it("la rotación mantiene sid y los access tokens anteriores hasta logout de la familia", async () => {
  const user = await createUser();
  const first = await signIn(app, user);
  const other = await signIn(app, user);
  const rotated = await post("refresh", { cookie: first.cookie });
  expect(rotated.statusCode).toBe(200);
  expect(decodeJwt(rotated.json().accessToken).sid).toBe(decodeJwt(first.token).sid);
  expect((await me(first.token)).statusCode).toBe(200);
  // An older refresh cookie still identifies the same family at logout.
  expect((await post("logout", { cookie: first.cookie })).statusCode).toBe(200);
  expect((await me(first.token)).statusCode).toBe(401);
  expect((await me(rotated.json().accessToken)).statusCode).toBe(401);
  expect((await post("refresh", { cookie: cookie(rotated) })).statusCode).toBe(401);
  expect((await me(other.token)).statusCode).toBe(200);
});

it("logout-all revoca todos los JWT y aumenta la versión de credenciales", async () => {
  const user = await createUser();
  const first = await signIn(app, user);
  const other = await signIn(app, user);
  expect((await post("logout-all", authorization(first.token))).statusCode).toBe(200);
  for (const session of [first, other]) {
    expect((await me(session.token)).statusCode).toBe(401);
    expect((await post("refresh", { cookie: session.cookie })).statusCode).toBe(401);
  }
  const next = await signIn(app, user);
  expect(decodeJwt(next.token).cv).toBe(1);
  expect((await me(next.token)).statusCode).toBe(200);
});

it("el reuso fuera de gracia revoca todas las familias y sus access tokens", async () => {
  const user = await createUser();
  const first = await signIn(app, user);
  const other = await signIn(app, user);
  const rotated = await post("refresh", { cookie: first.cookie });
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(Date.now() - 16_000) })
    .where(eq(refreshTokens.tokenHash, tokenHash(first.cookie.split("=")[1]!)));
  expect((await post("refresh", { cookie: first.cookie })).statusCode).toBe(401);
  for (const token of [first.token, other.token, rotated.json().accessToken])
    expect((await me(token)).statusCode).toBe(401);
  expect((await post("refresh", { cookie: other.cookie })).statusCode).toBe(401);
});

it("dos refresh concurrentes conservan la familia y devuelven una carrera controlada", async () => {
  const session = await signIn(app, await createUser());
  const results = await Promise.all([
    post("refresh", { cookie: session.cookie }),
    post("refresh", { cookie: session.cookie }),
  ]);
  expect(results.map((response) => response.statusCode).sort()).toEqual([200, 409]);
  expect(results.find((response) => response.statusCode === 409)!.json().error.code).toBe(
    "REFRESH_RACE",
  );
  expect((await me(session.token)).statusCode).toBe(200);
});

it("cambiar contraseña conserva la familia actual con JWT nuevo e invalida reset pendientes", async () => {
  const user = await createUser();
  const current = await signIn(app, user);
  const other = await signIn(app, user);
  const previousReset = await resetToken(user);
  const response = await app.inject({
    method: "PATCH",
    url: "/api/v1/me/password",
    headers: authorization(current.token),
    payload: { currentPassword: testPassword, newPassword: "ChangedPassword123!" },
  });
  expect(response.statusCode).toBe(200);
  const nextToken = response.json().accessToken;
  expect(decodeJwt(nextToken).sid).toBe(decodeJwt(current.token).sid);
  expect(decodeJwt(nextToken).cv).toBe(1);
  expect((await me(nextToken)).statusCode).toBe(200);
  expect((await me(current.token)).statusCode).toBe(401);
  expect((await me(other.token)).statusCode).toBe(401);
  expect((await post("refresh", { cookie: current.cookie })).statusCode).toBe(200);
  expect((await post("refresh", { cookie: other.cookie })).statusCode).toBe(401);
  expect(
    (await post("reset-password", {}, { token: previousReset, password: "AttackerPassword123!" }))
      .statusCode,
  ).toBe(400);
});

it("reset invalida todos los JWT y todos los enlaces pendientes en la misma transacción", async () => {
  const user = await createUser();
  const session = await signIn(app, user);
  const token = await resetToken(user);
  await db.insert(authTokens).values({
    userId: user.id,
    type: "password_reset",
    tokenHash: tokenHash("b".repeat(64)),
    expiresAt: new Date(Date.now() + 3600_000),
  });
  expect(
    (await post("reset-password", {}, { token, password: "ChangedPassword123!" })).statusCode,
  ).toBe(200);
  expect((await me(session.token)).statusCode).toBe(401);
  expect((await post("refresh", { cookie: session.cookie })).statusCode).toBe(401);
  expect(
    (await post("reset-password", {}, { token: "b".repeat(64), password: "AttackerPassword123!" }))
      .statusCode,
  ).toBe(400);
  expect((await db.select().from(authTokens)).every((row) => row.usedAt !== null)).toBe(true);
  expect((await me((await signIn(app, user, "ChangedPassword123!")).token)).statusCode).toBe(200);
});

it("authenticate exige sesión propia activa, versión actual y familia sin caducar", async () => {
  const user = await createUser();
  const session = await signIn(app, user);
  const identity = decodeJwt(session.token);
  const stranger = await createUser();
  expect((await me(await createAccessToken(user))).statusCode).toBe(401);
  expect((await me(await createAccessToken(stranger, String(identity.sid)))).statusCode).toBe(401);
  await db.update(users).set({ credentialsVersion: 1 }).where(eq(users.id, user.id));
  expect((await me(session.token)).statusCode).toBe(401);
  const current = await createAccessToken({ ...user, credentialsVersion: 1 }, String(identity.sid));
  expect((await me(current)).statusCode).toBe(200);
  await db
    .update(refreshTokens)
    .set({ expiresAt: new Date(0) })
    .where(eq(refreshTokens.familyId, String(identity.sid)));
  expect((await me(current)).statusCode).toBe(401);
});
