import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../plugins/auth.js";
import { parse, uuid, pageInput } from "../contracts/schemas.js";
import {
  unreadCount,
  listNotifications,
  readAllNotifications,
  updateNotification,
  getNotificationPreferences,
  updateNotificationPreferences,
} from "./service.js";
import { eventRoutes } from "./events.js";

const preferences = z.object({
  emailOnSignatureRequired: z.boolean(),
  emailOnApprovalResult: z.boolean(),
  emailOnExpiry: z.boolean(),
});

export async function notificationRoutes(app: FastifyInstance) {
  const auth = { preHandler: authenticate };
  await eventRoutes(app);
  app.get("/notifications/unread-count", auth, async (req) => ({
    count: await unreadCount(req.user.id),
  }));
  app.get("/notifications", auth, async (req) => {
    const query = parse(
      pageInput.extend({ unread: z.enum(["true", "false"]).optional() }),
      req.query,
    );
    return listNotifications(req.user.id, query);
  });
  app.post("/notifications/read-all", auth, async (req) => {
    return readAllNotifications(req.user.id);
  });
  for (const action of ["read", "delete"] as const) {
    const handler: import("fastify").RouteHandlerMethod = async (req) => {
      const id = parse(uuid, (req.params as { id: string }).id);
      return updateNotification(req.user.id, id, action);
    };
    if (action === "read") app.post("/notifications/:id/read", auth, handler);
    else app.delete("/notifications/:id", auth, handler);
  }
  app.get("/me/notification-preferences", auth, async (req) => {
    return getNotificationPreferences(req.user.id);
  });
  app.patch("/me/notification-preferences", auth, async (req) => {
    const patch = parse(
      preferences
        .partial()
        .strict()
        .refine((value) => Object.keys(value).length > 0),
      req.body,
    );
    return updateNotificationPreferences(req.user.id, patch);
  });
}
