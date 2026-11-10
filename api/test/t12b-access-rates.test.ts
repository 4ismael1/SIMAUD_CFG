import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { adminAuditLogs } from "../src/db/schema.js";
import {
  authorization,
  cleanDatabase,
  createUser,
  db,
  pool,
  prepareDatabase,
  signIn,
  testCedula,
} from "./helpers.js";

let app: FastifyInstance;
let actorId: string;
let headers: ReturnType<typeof authorization>;
beforeAll(async () => {
  await prepareDatabase();
  app = await buildApp({ logger: false });
});
beforeEach(async () => {
  await cleanDatabase();
  const admin = await createUser({ role: "admin" });
  actorId = admin.id;
  headers = authorization((await signIn(app, admin)).token);
});
afterAll(async () => {
  await app?.close();
  await pool.end();
});

it("comparte tres envíos por destinatario incluso entre administradores", async () => {
  const target = await createUser({ invitedAt: new Date(), mustChangePassword: true });
  const url = `/api/v1/users/${target.id}/password-reset`;
  for (let attempt = 0; attempt < 3; attempt++) {
    expect((await app.inject({ method: "POST", url, headers })).statusCode).toBe(202);
  }
  const other = await createUser({ role: "admin" });
  const otherHeaders = authorization((await signIn(app, other)).token);
  const limited = await app.inject({
    method: "POST",
    url: `/api/v1/users/${target.id}/resend-invite`,
    headers: otherHeaders,
  });
  expect(limited.statusCode).toBe(429);
  expect(limited.json().error.code).toBe("RATE_LIMITED");
  expect(
    await db.select().from(adminAuditLogs).where(eq(adminAuditLogs.actorId, other.id)),
  ).toHaveLength(0);
});

it("comparte diez envíos por administrador entre altas, reset e invitaciones", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/users",
    headers,
    payload: {
      email: "limitado@example.com",
      name: "Usuario invitado",
      phone: "8095551234",
      cedula: testCedula(),
    },
  });
  expect(created.statusCode).toBe(201);
  const target = await createUser({ invitedAt: new Date(), mustChangePassword: true });
  expect(
    (await app.inject({ method: "POST", url: `/api/v1/users/${target.id}/resend-invite`, headers }))
      .statusCode,
  ).toBe(202);
  for (let attempt = 0; attempt < 8; attempt++) {
    const recipient = await createUser();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/users/${recipient.id}/password-reset`,
          headers,
        })
      ).statusCode,
    ).toBe(202);
  }
  const limited = await app.inject({
    method: "POST",
    url: `/api/v1/users/${created.json().user.id}/password-reset`,
    headers,
  });
  expect(limited.statusCode).toBe(429);
  expect(limited.headers["retry-after"]).toBeTruthy();
  expect(
    await db.select().from(adminAuditLogs).where(eq(adminAuditLogs.actorId, actorId)),
  ).toHaveLength(10);
});
