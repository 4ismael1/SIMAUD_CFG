import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { decodeJwt } from "jose";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { users } from "../src/db/schema.js";
import { eventBus } from "../src/lib/events.js";
import { sessionUser } from "../src/lib/auth/sessions.js";
import { maintainConnection } from "../src/modules/notifications/events.js";
import { logoutAll, requestToken, consumeToken } from "../src/modules/auth/service.js";
import { dispatchEmails } from "../src/jobs/email-dispatch.js";
import {
  authorization,
  cleanDatabase,
  createUser,
  db,
  mailToken,
  pool,
  prepareDatabase,
  signIn,
} from "./helpers.js";
import type { Mail } from "../src/lib/mailer.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await buildApp({ logger: false });
});
afterEach(async () => {
  vi.useRealTimers();
  await app.close();
});
afterAll(() => pool.end());
const post = (path: string, headers: Record<string, string> = {}, payload: object = {}) =>
  app.inject({ method: "POST", url: "/api/v1/" + path, headers, payload });
async function identityFor(user: Awaited<ReturnType<typeof createUser>>) {
  const session = await signIn(app, user);
  const claims = decodeJwt(session.token);
  return {
    session,
    identity: {
      userId: user.id,
      sessionId: String(claims.sid),
      role: user.role,
      credentialsVersion: Number(claims.cv),
    },
  };
}
async function openStream(token: string) {
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  const ticketResponse = await post("events/ticket", authorization(token));
  expect(ticketResponse.statusCode).toBe(200);
  const ticket = ticketResponse.json().ticket;
  const response = await fetch(address + "/api/v1/events?token=" + ticket);
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  expect(first).toContain("event: unread-count");
  return { reader, ticket };
}

it("un ticket de sesión revocada se rechaza y sigue siendo de un uso", async () => {
  const user = await createUser();
  const session = await signIn(app, user);
  const ticket = (await post("events/ticket", authorization(session.token))).json().ticket;
  await post("auth/logout", { cookie: session.cookie });
  for (let index = 0; index < 2; index++)
    expect((await app.inject("/api/v1/events?token=" + ticket)).statusCode).toBe(401);
});

it.each(["logout", "logout-all", "reset", "inactive", "role"] as const)(
  "SSE cierra desde el servidor tras %s sin entregar la notificación posterior",
  async (reason) => {
    const user = await createUser();
    const session = await signIn(app, user);
    const { reader, ticket } = await openStream(session.token);
    try {
      expect((await app.inject("/api/v1/events?token=" + ticket)).statusCode).toBe(401);
      if (reason === "logout") await post("auth/logout", { cookie: session.cookie });
      else if (reason === "logout-all") {
        const other = await signIn(app, user);
        expect((await post("auth/logout-all", authorization(other.token))).statusCode).toBe(200);
      } else if (reason === "reset") {
        const mails: Mail[] = [];
        await requestToken(user.email, "password_reset");
        await dispatchEmails(async (mail) => {
          mails.push(mail);
        });
        await consumeToken(mailToken(mails), "password_reset", "UpdatedPassword123!");
      } else {
        const admin = await signIn(app, await createUser({ role: "admin" }));
        const response = await app.inject({
          method: "PATCH",
          url: "/api/v1/users/" + user.id,
          headers: authorization(admin.token),
          payload: reason === "inactive" ? { isActive: false } : { role: "gestor" },
        });
        expect(response.statusCode).toBe(200);
      }
      eventBus.publish(user.id, { type: "notification", data: { marker: "after-revoke" } });
      let remaining = "";
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        remaining += new TextDecoder().decode(chunk.value);
      }
      expect(remaining).not.toContain("after-revoke");
    } finally {
      await reader.cancel();
    }
  },
);

it("logout de otra familia no cierra SSE de la sesión actual", async () => {
  const user = await createUser();
  const { identity } = await identityFor(user);
  const other = await signIn(app, user);
  const send = vi.fn();
  const disconnect = vi.fn();
  const close = maintainConnection(identity, send, disconnect);
  try {
    await post("auth/logout", { cookie: other.cookie });
    eventBus.publish(user.id, { type: "notification", data: {} });
    expect(disconnect).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledExactlyOnceWith("notification", {});
    await logoutAll(user.id);
    expect(disconnect).toHaveBeenCalledTimes(1);
  } finally {
    close();
  }
});

it.each(["inactive", "role", "version", "email"] as const)(
  "el heartbeat revalida %s en BD en 25 segundos aunque no llegue evento",
  async (reason) => {
    const user = await createUser();
    const { identity } = await identityFor(user);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    const disconnect = vi.fn();
    let validation: ReturnType<typeof sessionUser> | undefined;
    const close = maintainConnection(identity, vi.fn(), disconnect, () => {
      validation = sessionUser(identity);
      return validation;
    });
    try {
      const changes =
        reason === "inactive"
          ? { isActive: false }
          : reason === "role"
            ? { role: "gestor" as const }
            : reason === "version"
              ? { credentialsVersion: 1 }
              : { emailConfirmedAt: null };
      await db.update(users).set(changes).where(eq(users.id, user.id));
      await vi.advanceTimersByTimeAsync(25_000);
      await validation;
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(await sessionUser(identity)).toBeUndefined();
    } finally {
      close();
    }
  },
);

it("la conexión tiene máximo absoluto de una hora y libera timers y listeners", async () => {
  const user = await createUser();
  const { identity } = await identityFor(user);
  vi.useFakeTimers();
  const send = vi.fn();
  const disconnect = vi.fn();
  const validate = vi.fn(async () => user);
  const close = maintainConnection(identity, send, disconnect, validate);
  await vi.advanceTimersByTimeAsync(3600_000);
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  send.mockClear();
  eventBus.publish(user.id, { type: "notification", data: {} });
  expect(send).not.toHaveBeenCalled();
  close();
  expect(disconnect).toHaveBeenCalledTimes(1);
});

it("un error de revalidación cierra la conexión sin publicar ping", async () => {
  const user = await createUser();
  const { identity } = await identityFor(user);
  vi.useFakeTimers();
  const send = vi.fn();
  const disconnect = vi.fn();
  const close = maintainConnection(identity, send, disconnect, async () => {
    throw new Error("database unavailable");
  });
  await vi.advanceTimersByTimeAsync(25_000);
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(send).not.toHaveBeenCalled();
  close();
});
