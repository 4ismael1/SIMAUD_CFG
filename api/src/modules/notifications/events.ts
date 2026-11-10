import { randomBytes, createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { authenticate } from "../../plugins/auth.js";
import { unauthorized } from "../../lib/errors.js";
import { eventBus } from "../../lib/events.js";
import { parse } from "../contracts/schemas.js";
import { unreadCount } from "./service.js";

const ticketHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function eventRoutes(app: FastifyInstance) {
  const auth = { preHandler: authenticate };
  const tickets = new Map<string, { userId: string; role: string; expires: number }>();
  const connections = new Set<() => void>();
  app.post("/events/ticket", auth, async (req) => {
    for (const [key, value] of tickets) if (value.expires <= Date.now()) tickets.delete(key);
    const token = randomBytes(32).toString("base64url");
    tickets.set(ticketHash(token), {
      userId: req.user.id,
      role: req.user.role,
      expires: Date.now() + 30_000,
    });
    return { ticket: token, expiresIn: 30 };
  });
  app.get("/events", async (req, reply) => {
    const { token } = parse(z.object({ token: z.string().min(40).max(100) }), req.query);
    const key = ticketHash(token);
    const ticket = tickets.get(key);
    tickets.delete(key);
    if (!ticket || ticket.expires <= Date.now()) throw unauthorized();
    const [user] = await db.select().from(users).where(eq(users.id, ticket.userId));
    if (!user || !user.isActive || user.deletedAt || user.role !== ticket.role)
      throw unauthorized();
    reply.hijack();
    reply.raw.writeHead(200, {
      ...(reply.getHeaders() as import("node:http").OutgoingHttpHeaders),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (type: string, data: unknown) => {
      if (!reply.raw.destroyed)
        reply.raw.write("event: " + type + "\ndata: " + JSON.stringify(data) + "\n\n");
    };
    const unsubscribe = eventBus.subscribe(user.id, (event) => send(event.type, event.data));
    const heartbeat = setInterval(() => send("ping", { time: new Date().toISOString() }), 25_000);
    const close = () => {
      clearInterval(heartbeat);
      unsubscribe();
      connections.delete(close);
      reply.raw.end();
    };
    connections.add(close);
    reply.raw.on("close", close);
    send("unread-count", { count: await unreadCount(user.id) });
  });
  app.addHook("preClose", async () => {
    for (const close of connections) close();
    tickets.clear();
  });
}
