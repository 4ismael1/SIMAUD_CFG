import { validPng } from "./image-fixtures.js";
import { dispatchEmails } from "../src/jobs/email-dispatch.js";
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { authTokens, contracts, refreshTokens, users } from "../src/db/schema.js";
import type { Mail } from "../src/lib/mailer.js";
import { createAccessToken } from "../src/lib/auth/jwt.js";
import { tokenHash } from "../src/modules/auth/service.js";
import { avatarDirectory } from "../src/modules/me/avatar.js";
import { readFile } from "node:fs/promises";
import {
  authorization,
  cleanDatabase,
  cookie,
  createUser,
  db,
  mailToken,
  pool,
  prepareDatabase,
  signIn,
  testPassword,
} from "./helpers.js";
let app: FastifyInstance;
let mails: Mail[];
const base = "/api/v1";
const registration = {
  email: "new@example.com",
  password: testPassword,
  name: "Nueva cuenta",
  phone: "8095551234",
  cedula: "00113918205",
};
beforeAll(prepareDatabase);
afterAll(() => pool.end());
beforeEach(async () => {
  await cleanDatabase();
  mails = [];
  app = await buildApp({
    logger: false,
    mailer: async (mail) => {
      mails.push(mail);
    },
  });
});
afterEach(async () => {
  await app.close();
});
const deliverMails = () =>
  dispatchEmails(async (mail) => {
    mails.push(mail);
  });
const post = async (url: string, payload: unknown, headers: Record<string, string> = {}) => {
  const response = await app.inject({
    method: "POST",
    url: base + url,
    payload: payload as object,
    headers,
  });
  await deliverMails();
  return response;
};
describe("auth", () => {
  it("registro rechaza cédula inválida con detalle por campo", async () => {
    const response = await post("/auth/register", { ...registration, cedula: "0011391820" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toContainEqual({
      field: "cedula",
      message: "La cédula debe tener 11 dígitos, con o sin guiones.",
    });
    expect(await db.select().from(users)).toHaveLength(0);
  });
  it("health comprueba PostgreSQL", async () => {
    const r = await app.inject(base + "/health");
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: "ok", db: "ok" });
  });
  it("registro rechaza rol, guarda hashes y exige confirmación", async () => {
    const unknownField = await post("/auth/register", { ...registration, role: "admin" });
    expect(unknownField.statusCode).toBe(400);
    expect(await db.select().from(users)).toHaveLength(0);
    const r = await post("/auth/register", registration);
    expect(r.statusCode).toBe(202);
    expect(r.json()).toEqual({ message: "Revisa tu correo." });
    expect(r.body).not.toMatch(/passwordHash|tokenHash|password_hash/);
    const [u] = await db.select().from(users);
    expect(u!.role).toBe("user");
    expect(u!.passwordHash).toMatch(/^\$argon2id\$/);
    const [t] = await db.select().from(authTokens);
    expect(t!.tokenHash).toBe(tokenHash(mailToken(mails)));
    expect(t!.tokenHash).not.toBe(mailToken(mails));
    const login = await post("/auth/login", {
      email: registration.email,
      password: testPassword,
    });
    expect(login.statusCode).toBe(403);
    expect(login.json().error.code).toBe("EMAIL_NOT_CONFIRMED");
    const token = mailToken(mails);
    expect((await post("/auth/confirm-email", { token })).statusCode).toBe(200);
    expect((await post("/auth/confirm-email", { token })).statusCode).toBe(400);
    const signed = await signIn(app, registration);
    expect(signed.response.headers["set-cookie"]).toMatch(/HttpOnly/);
    expect(signed.response.headers["set-cookie"]).toMatch(/SameSite=Lax/);
  });
  it("registro duplicado es opaco y disponibilidad pública no existe", async () => {
    await post("/auth/register", registration);
    const email = await post("/auth/register", {
      ...registration,
      email: " NEW@EXAMPLE.COM ",
      cedula: "40200700678",
    });
    expect(email.statusCode).toBe(202);
    expect(email.json()).toEqual({ message: "Revisa tu correo." });
    const cedula = await post("/auth/register", {
      ...registration,
      email: "other@example.com",
    });
    expect(cedula.statusCode).toBe(202);
    expect(cedula.body).toBe(email.body);
    expect(await db.select().from(users)).toHaveLength(1);
    expect(
      (await app.inject(base + "/auth/availability?email=NEW%40example.com&cedula=00113918205"))
        .statusCode,
    ).toBe(404);
  });
  it("refresh rota y el reuso revoca todas las sesiones", async () => {
    const u = await createUser();
    const first = await signIn(app, u);
    const other = await signIn(app, u);
    const rotated = await post("/auth/refresh", {}, { cookie: first.cookie });
    expect(rotated.statusCode).toBe(200);
    expect(cookie(rotated)).not.toBe(first.cookie);
    expect(rotated.json().accessToken).toBeTypeOf("string");
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date(Date.now() - 16000) })
      .where(eq(refreshTokens.tokenHash, tokenHash(first.cookie.split("=")[1]!)));
    expect((await post("/auth/refresh", {}, { cookie: first.cookie })).statusCode).toBe(401);
    expect((await post("/auth/refresh", {}, { cookie: cookie(rotated) })).statusCode).toBe(401);
    expect((await post("/auth/refresh", {}, { cookie: other.cookie })).statusCode).toBe(401);
  });
  it("dos refresh concurrentes devuelven REFRESH_RACE y conservan la familia", async () => {
    const u = await createUser();
    const login = await signIn(app, u);
    const results = await Promise.all([
      post("/auth/refresh", {}, { cookie: login.cookie }),
      post("/auth/refresh", {}, { cookie: login.cookie }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.statusCode === 409)!.json().error.code).toBe("REFRESH_RACE");
    expect(results.find((r) => r.statusCode === 409)!.headers["set-cookie"]).toBeUndefined();
    expect(
      (
        await post(
          "/auth/refresh",
          {},
          { cookie: cookie(results.find((r) => r.statusCode === 200)!) },
        )
      ).statusCode,
    ).toBe(200);
  });
  it("logout y logout-all revocan sesiones y limpian cookie", async () => {
    const u = await createUser();
    const a = await signIn(app, u);
    const b = await signIn(app, u);
    const out = await post("/auth/logout", {}, { cookie: a.cookie });
    expect(out.statusCode).toBe(200);
    expect(out.headers["set-cookie"]).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await post("/auth/refresh", {}, { cookie: a.cookie })).statusCode).toBe(401);
    expect((await post("/auth/logout-all", {}, authorization(b.token))).statusCode).toBe(200);
    expect((await post("/auth/refresh", {}, { cookie: b.cookie })).statusCode).toBe(401);
  });
  it("forgot/reset es opaco, un solo uso e invalida refresh tokens", async () => {
    const u = await createUser();
    const session = await signIn(app, u);
    const unknown = await post("/auth/forgot-password", {
      email: "missing@example.com",
    });
    const known = await post("/auth/forgot-password", { email: u.email });
    expect(known.body).toBe(unknown.body);
    const token = mailToken(mails);
    expect(
      (
        await post("/auth/reset-password", {
          token,
          password: "ChangedPass123",
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await post("/auth/reset-password", { token, password: "AgainPass123" })).statusCode,
    ).toBe(400);
    expect((await post("/auth/refresh", {}, { cookie: session.cookie })).statusCode).toBe(401);
    expect((await post("/auth/login", { email: u.email, password: testPassword })).statusCode).toBe(
      401,
    );
    await signIn(app, u, "ChangedPass123");
  });
  it("resend no revela cuentas y conserva la confirmación durante el enfriamiento", async () => {
    await post("/auth/register", registration);
    const old = mailToken(mails);
    const unknown = await post("/auth/resend-confirmation", {
      email: "missing@example.com",
    });
    const known = await post("/auth/resend-confirmation", {
      email: registration.email,
    });
    expect(known.body).toBe(unknown.body);
    expect(mails).toHaveLength(1);
    expect(mailToken(mails) === old).toBe(true);
    expect((await post("/auth/confirm-email", { token: old })).statusCode).toBe(200);
    expect((await post("/auth/confirm-email", { token: old })).statusCode).toBe(400);
  });
  it("rechaza tokens caducados y JWT de rol cambiado", async () => {
    await post("/auth/register", registration);
    const token = mailToken(mails);
    await db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await post("/auth/confirm-email", { token })).statusCode).toBe(400);
    const u = await createUser();
    const login = await signIn(app, u);
    await db.update(users).set({ role: "gestor" }).where(eq(users.id, u.id));
    expect(
      (
        await app.inject({
          url: base + "/me",
          headers: authorization(login.token),
        })
      ).statusCode,
    ).toBe(401);
  });
  it("rate limit 5/min por IP y email normalizado", async () => {
    for (let i = 0; i < 5; i++)
      expect(
        (
          await post("/auth/login", {
            email: "missing@example.com",
            password: "wrong",
          })
        ).statusCode,
      ).toBe(401);
    const r = await post("/auth/login", {
      email: " MISSING@EXAMPLE.COM ",
      password: "wrong",
    });
    expect(r.statusCode).toBe(429);
    expect(r.json().error.code).toBe("RATE_LIMITED");
    expect(
      (
        await post("/auth/login", {
          email: "other@example.com",
          password: "wrong",
        })
      ).statusCode,
    ).toBe(401);
  });
  it("JWT inválido y validación devuelven errores uniformes sin secretos", async () => {
    expect(
      (await app.inject({ url: base + "/me", headers: authorization("bad") })).json().error.code,
    ).toBe("UNAUTHORIZED");
    expect(
      (await post("/auth/register", { ...registration, password: "weak" })).json().error.code,
    ).toBe("VALIDATION_ERROR");
    expect((await app.inject(base + "/absent")).json().error.code).toBe("NOT_FOUND");
    const jwt = await createAccessToken({ id: randomUUID(), role: "admin" });
    expect((await app.inject({ url: base + "/me", headers: authorization(jwt) })).statusCode).toBe(
      401,
    );
  });
});
describe("perfil", () => {
  it("actualiza perfil, rechaza cédula duplicada y no permite cambiar rol", async () => {
    const u = await createUser();
    const other = await createUser();
    const login = await signIn(app, u);
    const r = await app.inject({
      method: "PATCH",
      url: base + "/me",
      headers: authorization(login.token),
      payload: { name: "Nuevo nombre", phone: "8295551234", cedula: "40200700678" },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().user.name).toBe("Nuevo nombre");
    const conflict = await app.inject({
      method: "PATCH",
      url: base + "/me",
      headers: authorization(login.token),
      payload: { cedula: other.cedula },
    });
    expect(conflict.statusCode).toBe(409);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: base + "/me",
          headers: authorization(login.token),
          payload: { role: "admin" },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("cambia contraseña y preserva solo la sesión actual", async () => {
    const u = await createUser();
    const current = await signIn(app, u);
    const other = await signIn(app, u);
    const r = await app.inject({
      method: "PATCH",
      url: base + "/me/password",
      headers: authorization(current.token),
      payload: { currentPassword: testPassword, newPassword: "ChangedPass123" },
    });
    expect(r.statusCode).toBe(200);
    expect((await post("/auth/refresh", {}, { cookie: other.cookie })).statusCode).toBe(401);
    expect((await post("/auth/refresh", {}, { cookie: current.cookie })).statusCode).toBe(200);
    await signIn(app, u, "ChangedPass123");
  });
  it("aplica email solamente al confirmar y revoca sesiones", async () => {
    const u = await createUser();
    const login = await signIn(app, u);
    const r = await app.inject({
      method: "PATCH",
      url: base + "/me/email",
      headers: authorization(login.token),
      payload: { newEmail: "changed@example.com", password: testPassword },
    });
    expect(r.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          url: base + "/me",
          headers: authorization(login.token),
        })
      ).json().email,
    ).toBe(u.email);
    await deliverMails();
    expect(mails[0]!.to).toBe("changed@example.com");
    expect((await post("/auth/confirm-email", { token: mailToken(mails) })).statusCode).toBe(200);
    expect((await post("/auth/refresh", {}, { cookie: login.cookie })).statusCode).toBe(401);
    await signIn(app, { email: "changed@example.com" });
  });
  it("rechaza avatares falsos y grandes, guarda, sirve y borra PNG", async () => {
    const u = await createUser();
    const login = await signIn(app, u);
    const upload = (data: Buffer, mime = "image/png") =>
      app.inject({
        method: "PUT",
        url: base + "/me/avatar",
        headers: {
          ...authorization(login.token),
          "content-type": "multipart/form-data; boundary=avatar-test",
        },
        payload: Buffer.concat([
          Buffer.from(
            '--avatar-test\r\nContent-Disposition: form-data; name="avatar"; filename="test.png"\r\nContent-Type: ' +
              mime +
              "\r\n\r\n",
          ),
          data,
          Buffer.from("\r\n--avatar-test--\r\n"),
        ]),
      });
    expect((await upload(Buffer.from("fake"))).statusCode).toBe(400);
    expect((await upload(Buffer.alloc(2 * 1024 * 1024 + 1))).statusCode).toBe(413);
    const png = validPng();
    const r = await upload(png);
    expect(r.statusCode).toBe(200);
    const name = r.json().user.avatarPath;
    expect(await readFile(avatarDirectory + name)).toEqual(png);
    const image = await app.inject(base + "/files/avatars/" + name);
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toMatch(/image\/png/);
    expect(image.rawPayload).toEqual(png);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: base + "/me/avatar",
          headers: authorization(login.token),
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject(base + "/files/avatars/" + name)).statusCode).toBe(404);
  });
});
describe("usuarios", () => {
  it("no admin recibe 403 y lookup limita roles y campos", async () => {
    const u = await createUser();
    const login = await signIn(app, u);
    for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) {
      const r = await app.inject({
        method,
        url: base + "/users" + (["PATCH", "DELETE"].includes(method) ? "/" + u.id : ""),
        headers: authorization(login.token),
        ...(["POST", "PATCH"].includes(method)
          ? {
              payload:
                method === "POST" ? { ...registration, role: "user" } : { name: "No permitido" },
            }
          : {}),
      });
      expect(r.statusCode).toBe(403);
    }
    expect(
      (
        await app.inject({
          url: base + "/users/lookup?cedula=" + u.cedula,
          headers: authorization(login.token),
        })
      ).statusCode,
    ).toBe(403);
    for (const role of ["admin", "supervisor", "gestor"] as const) {
      const actor = await createUser({ role });
      const session = await signIn(app, actor);
      const r = await app.inject({
        url: base + "/users/lookup?cedula=" + u.cedula,
        headers: authorization(session.token),
      });
      expect(r.statusCode).toBe(200);
      expect(Object.keys(r.json()).sort()).toEqual(
        ["id", "name", "email", "phone", "cedula", "position"].sort(),
      );
    }
  });
  it("admin no puede borrarse, desactivarse ni quitarse admin", async () => {
    const u = await createUser({ role: "admin" });
    const login = await signIn(app, u);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: base + "/users/" + u.id,
          headers: authorization(login.token),
        })
      ).statusCode,
    ).toBe(409);
    for (const payload of [{ role: "user" }, { isActive: false }])
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: base + "/users/" + u.id,
            headers: authorization(login.token),
            payload,
          })
        ).statusCode,
      ).toBe(409);
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row!.role).toBe("admin");
    expect(row!.isActive).toBe(true);
  });
  it("admins concurrentes no pueden dejar el sistema sin admins", async () => {
    const a = await createUser({ role: "admin" });
    const b = await createUser({ role: "admin" });
    const sa = await signIn(app, a);
    const sb = await signIn(app, b);
    const results = await Promise.all([
      app.inject({
        method: "PATCH",
        url: base + "/users/" + b.id,
        headers: authorization(sa.token),
        payload: { role: "user" },
      }),
      app.inject({
        method: "PATCH",
        url: base + "/users/" + a.id,
        headers: authorization(sb.token),
        payload: { role: "user" },
      }),
    ]);
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    const admins = (await db.select().from(users)).filter(
      (u) => u.role === "admin" && u.isActive && !u.deletedAt,
    );
    expect(admins).toHaveLength(1);
  });
  it("crea sin contraseña, lista y edita; soft delete bloquea login y conserva contratos", async () => {
    const admin = await createUser({ role: "admin" });
    const session = await signIn(app, admin);
    const created = await post(
      "/users",
      { ...registration, password: undefined, role: "gestor" },
      authorization(session.token),
    );
    expect(created.statusCode).toBe(201);
    const user = created.json().user;
    expect(user.emailConfirmedAt).toBeTruthy();
    expect(mails[0]!.text).toContain("/auth/restablecer?token=");
    expect(
      (
        await post("/auth/reset-password", {
          token: mailToken(mails),
          password: testPassword,
        })
      ).statusCode,
    ).toBe(200);
    const signed = await signIn(app, user);
    const list = await app.inject({
      url: base + "/users?q=Nueva&role=gestor&page=1&pageSize=1&sort=name",
      headers: authorization(session.token),
    });
    expect(list.json().meta).toEqual({ page: 1, pageSize: 1, total: 1 });
    expect(list.body).not.toMatch(/passwordHash|tokenHash|password_hash/);
    const patch = await app.inject({
      method: "PATCH",
      url: base + "/users/" + user.id,
      headers: authorization(session.token),
      payload: { name: "Usuario Editado" },
    });
    expect(patch.statusCode).toBe(200);
    await db
      .insert(contracts)
      .values({ title: "Conservar", content: "contenido", createdBy: user.id });
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: base + "/users/" + user.id,
          headers: authorization(session.token),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await post("/auth/login", { email: user.email, password: testPassword })).statusCode,
    ).toBe(401);
    expect((await post("/auth/refresh", {}, { cookie: signed.cookie })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: base + "/me",
          headers: authorization(signed.token),
        })
      ).statusCode,
    ).toBe(401);
    expect(await db.select().from(contracts)).toHaveLength(1);
    expect((await db.select().from(users).where(eq(users.id, user.id)))[0]!.deletedAt).toBeTruthy();
  });
});
