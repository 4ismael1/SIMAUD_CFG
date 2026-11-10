import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { adminAuditLogs, authTokens, emailOutbox, users } from "../src/db/schema.js";
import { decryptPayload, payloadContext } from "../src/lib/mail/payload.js";
import {
  authorization,
  cleanDatabase,
  createUser,
  db,
  pool,
  prepareDatabase,
  signIn,
  testCedula,
  testPassword,
} from "./helpers.js";

let app: FastifyInstance;
let headers: ReturnType<typeof authorization>;
let actorId: string;
let targetId: string;
beforeAll(async () => {
  await prepareDatabase();
  app = await buildApp({ logger: false });
});
beforeEach(async () => {
  await cleanDatabase();
  const admin = await createUser({ role: "admin" });
  actorId = admin.id;
  headers = authorization((await signIn(app, admin)).token);
  targetId = (await createUser()).id;
});
afterAll(async () => {
  await app?.close();
  await pool.end();
});
const request = (method: "POST" | "PATCH" | "DELETE", suffix: string, payload?: object) =>
  app.inject({ method, url: `/api/v1/users/${targetId}${suffix}`, headers, payload });
const entries = () =>
  db
    .select()
    .from(adminAuditLogs)
    .where(eq(adminAuditLogs.actorId, actorId))
    .orderBy(adminAuditLogs.sequence);

describe("gestión de acceso", () => {
  it("rechaza contraseñas administrativas en alta y edición", async () => {
    const result = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers,
      payload: {
        email: "nuevo@example.com",
        name: "Nuevo usuario",
        phone: "8095551234",
        cedula: testCedula(),
        password: testPassword,
      },
    });
    expect(result.statusCode).toBe(400);
    expect((await request("PATCH", "", { password: testPassword })).statusCode).toBe(400);
    expect(await entries()).toHaveLength(0);
  });

  it("crea invitación cifrada, reenvía y activa mediante enlace de un uso", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers,
      payload: {
        email: "nuevo@example.com",
        name: "Nuevo usuario",
        phone: "8095551234",
        cedula: testCedula(),
      },
    });
    expect(created.statusCode).toBe(201);
    targetId = created.json().user.id;
    expect(created.json().user.invitedAt).toBeTruthy();
    expect((await request("POST", "/resend-invite")).statusCode).toBe(202);
    const mails = await db.select().from(emailOutbox).orderBy(emailOutbox.createdAt);
    expect(mails).toHaveLength(2);
    expect(
      mails.every((mail) => JSON.stringify(mail.payload) === "{}" && mail.encryptedPayload),
    ).toBe(true);
    const mail = mails.at(-1)!;
    const token = decryptPayload(
      mail.encryptedPayload!,
      payloadContext(mail.to, mail.template),
    ).token!;
    expect(JSON.stringify(await entries()).includes(token)).toBe(false);
    const activate = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/reset-password",
        payload: { token, password: testPassword },
      });
    expect((await activate()).statusCode).toBe(200);
    expect((await activate()).statusCode).toBe(400);
    expect((await request("POST", "/resend-invite")).statusCode).toBe(409);
    expect(
      (await app.inject({ url: "/api/v1/users?status=active", headers }))
        .json()
        .data.some((user: { id: string }) => user.id === targetId),
    ).toBe(true);
  });

  it("restablece con caducidad de una hora y revoca sesiones inmediatamente", async () => {
    const [user] = await db.select().from(users).where(eq(users.id, targetId));
    const session = authorization((await signIn(app, user!)).token);
    expect((await request("POST", "/password-reset")).statusCode).toBe(202);
    expect((await app.inject({ url: "/api/v1/me", headers: session })).statusCode).toBe(401);
    const [token] = await db.select().from(authTokens).where(eq(authTokens.userId, targetId));
    expect(token!.expiresAt.getTime() - token!.createdAt.getTime()).toBeGreaterThan(3599000);
    expect(token!.expiresAt.getTime() - token!.createdAt.getTime()).toBeLessThan(3601000);
    expect((await entries())[0]!.action).toBe("user.password_reset");
  });

  it("filtra estados sin incluir bajas y devuelve fechas de acceso", async () => {
    await db
      .update(users)
      .set({ invitedAt: new Date(), mustChangePassword: true })
      .where(eq(users.id, targetId));
    const invited = (await app.inject({ url: "/api/v1/users?status=invited", headers })).json();
    expect(invited.data.map((user: { id: string }) => user.id)).toEqual([targetId]);
    expect(invited.data[0]).toMatchObject({ status: "invited", lastLoginAt: null });
    await request("PATCH", "", { isActive: false });
    expect(
      (await app.inject({ url: "/api/v1/users?status=inactive", headers })).json().data[0].id,
    ).toBe(targetId);
    expect((await request("POST", "/password-reset")).statusCode).toBe(409);
    await request("DELETE", "");
    expect(
      (await app.inject({ url: "/api/v1/users?status=inactive", headers })).json().meta.total,
    ).toBe(0);
  });

  it("comparte límite por destinatario entre reenvío y reset y no audita rechazos", async () => {
    await db
      .update(users)
      .set({ invitedAt: new Date(), mustChangePassword: true })
      .where(eq(users.id, targetId));
    expect((await request("POST", "/resend-invite")).statusCode).toBe(202);
    expect((await request("POST", "/password-reset")).statusCode).toBe(202);
    expect((await request("POST", "/resend-invite")).statusCode).toBe(202);
    const limited = await request("POST", "/password-reset");
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeTruthy();
    expect(await entries()).toHaveLength(3);
  });

  it("devuelve no encontrado para un destinatario inexistente", async () => {
    targetId = randomUUID();
    expect((await request("POST", "/password-reset")).statusCode).toBe(404);
  });
});
