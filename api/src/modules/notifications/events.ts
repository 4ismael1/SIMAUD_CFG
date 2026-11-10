import { randomBytes, createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sessionUser, type SessionIdentity } from "../../lib/auth/sessions.js";
import { authenticate } from "../../plugins/auth.js";
import { unauthorized } from "../../lib/errors.js";
import { eventBus } from "../../lib/events.js";
import { parse } from "../contracts/schemas.js";
import { unreadCount } from "./service.js";

const ticketHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function maintainConnection(
  identity: SessionIdentity,
  send: (type: string, data: unknown) => void,
  disconnect: () => void,
  validate = () => sessionUser(identity),
) {
  let closed = false;
  let checking = false;
  const unsubscribe = eventBus.subscribe(identity.userId, (event) => {
    if (event.type === "role-changed") return close();
    if (event.type === "session-revoked") {
      if (event.data.exceptId === identity.sessionId) return;
      if (!event.data.sessionId || event.data.sessionId === identity.sessionId) close();
      return;
    }
    if (!closed) send(event.type, event.data);
  });
  const heartbeat = setInterval(() => {
    void revalidate();
  }, 25_000);
  const maximumLifetime = setTimeout(() => close(), 3600_000);
  function close() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(maximumLifetime);
    unsubscribe();
    disconnect();
  }
  async function revalidate() {
    if (closed) return;
    if (checking) return close();
    checking = true;
    try {
      const user = await validate();
      if (!user || user.mustChangePassword) close();
      else if (!closed) send("ping", { time: new Date().toISOString() });
    } catch {
      // Fail closed on database errors; never keep an unverifiable subscription alive.
      close();
    } finally {
      checking = false;
    }
  }
  return close;
}
export async function eventRoutes(app: FastifyInstance) {
  const auth = { preHandler: authenticate };
  const tickets = new Map<string, SessionIdentity & { expires: number }>();
  const connections = new Set<() => void>();
  app.post("/events/ticket", auth, async (req) => {
    for (const [key, value] of tickets) if (value.expires <= Date.now()) tickets.delete(key);
    const token = randomBytes(32).toString("base64url");
    tickets.set(ticketHash(token), {
      userId: req.user.id,
      role: req.user.role,
      sessionId: req.sessionId!,
      credentialsVersion: req.credentialsVersion,
      expires: Date.now() + 30_000,
    });
    return { ticket: token, expiresIn: 30 };
  });
  app.get("/events", async (req, reply) => {
    const { token } = parse(z.object({ token: z.string().min(40).max(100) }).strict(), req.query);
    const key = ticketHash(token);
    const ticket = tickets.get(key);
    tickets.delete(key);
    if (!ticket || ticket.expires <= Date.now()) throw unauthorized();
    const user = await sessionUser(ticket);
    if (!user || user.mustChangePassword) throw unauthorized();
    reply.hijack();
    reply.raw.writeHead(200, {
      ...(reply.getHeaders() as import("node:http").OutgoingHttpHeaders),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (type: string, data: unknown) => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded)
        reply.raw.write("event: " + type + "\ndata: " + JSON.stringify(data) + "\n\n");
    };
    const close = maintainConnection(ticket, send, () => {
      connections.delete(close);
      reply.raw.end();
    });
    connections.add(close);
    reply.raw.on("close", close);
    try {
      const count = await unreadCount(user.id);
      // Revalidate after subscription so a revoke between ticket validation and subscribe cannot escape.
      if (!(await sessionUser(ticket))) close();
      else send("unread-count", { count });
    } catch {
      // A failed initial read must release timers and listeners too.
      close();
    }
  });
  app.addHook("preClose", async () => {
    for (const close of connections) close();
    tickets.clear();
  });
}
