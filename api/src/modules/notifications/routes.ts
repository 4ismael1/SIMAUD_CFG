import { randomBytes, createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { notifications, users } from "../../db/schema.js";
import { authenticate } from "../../plugins/auth.js";
import { unauthorized } from "../../lib/errors.js";
import { eventBus } from "../../lib/events.js";
import { parse, uuid, pageInput } from "../contracts/schemas.js";
import { notFound } from "../contracts/service.js";
import { publishUnread, unreadCount } from "./service.js";
const preferences = z.object({
  emailOnSignatureRequired: z.boolean(),
  emailOnApprovalResult: z.boolean(),
  emailOnExpiry: z.boolean(),
});
const ticketHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function notificationRoutes(app: FastifyInstance) {
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
  app.get("/notifications/unread-count", auth, async (req) => ({
    count: await unreadCount(req.user.id),
  }));
  app.get("/notifications", auth, async (req) => {
    const query = parse(
      pageInput.extend({ unread: z.enum(["true", "false"]).optional() }),
      req.query,
    );
    const filter = and(
      eq(notifications.userId, req.user.id),
      query.unread === "true"
        ? isNull(notifications.readAt)
        : query.unread === "false"
          ? sql`${notifications.readAt} is not null`
          : undefined,
    );
    const data = await db
      .select()
      .from(notifications)
      .where(filter)
      .orderBy(sql`${notifications.createdAt} desc`, notifications.id)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [total] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(filter);
    return {
      data: data.map((row) => ({ ...row, link: row.actionUrl })),
      meta: { page: query.page, pageSize: query.pageSize, total: total!.count },
    };
  });
  app.post("/notifications/read-all", auth, async (req) => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, req.user.id), isNull(notifications.readAt)));
    await publishUnread(req.user.id);
    return { message: "Notificaciones leídas." };
  });
  for (const action of ["read", "delete"] as const) {
    const handler: import("fastify").RouteHandlerMethod = async (req) => {
      const id = parse(uuid, (req.params as { id: string }).id);
      const filter = and(eq(notifications.id, id), eq(notifications.userId, req.user.id));
      const rows =
        action === "read"
          ? await db.update(notifications).set({ readAt: new Date() }).where(filter).returning()
          : await db.delete(notifications).where(filter).returning();
      if (!rows.length) throw notFound();
      await publishUnread(req.user.id);
      return { message: "Notificación actualizada." };
    };
    if (action === "read") app.post("/notifications/:id/read", auth, handler);
    else app.delete("/notifications/:id", auth, handler);
  }
  app.get("/me/notification-preferences", auth, async (req) => {
    const [user] = await db
      .select({ preferences: users.notificationPreferences })
      .from(users)
      .where(eq(users.id, req.user.id));
    return user!.preferences;
  });
  app.patch("/me/notification-preferences", auth, async (req) => {
    const patch = parse(
      preferences
        .partial()
        .strict()
        .refine((value) => Object.keys(value).length > 0),
      req.body,
    );
    const [user] = await db
      .update(users)
      .set({
        notificationPreferences: sql`${users.notificationPreferences} || ${JSON.stringify(patch)}::jsonb`,
      })
      .where(eq(users.id, req.user.id))
      .returning();
    return user!.notificationPreferences;
  });
  app.addHook("preClose", async () => {
    for (const close of connections) close();
    tickets.clear();
  });
}
