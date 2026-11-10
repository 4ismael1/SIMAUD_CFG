import { enqueueNotificationMail } from "../../lib/mail/notifications.js";
import { notFound } from "../contracts/service.js";

import { and, eq, isNull, sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { notifications, users } from "../../db/schema.js";
import { afterCommit, eventBus } from "../../lib/events.js";

type NotificationPreferences = {
  emailOnSignatureRequired: boolean;
  emailOnApprovalResult: boolean;
  emailOnExpiry: boolean;
};

export function notificationLink(type: string, contractId?: string) {
  if (type.startsWith("renewal_")) return "/renovaciones";
  if (type === "approval_needed") return "/aprobaciones";
  if (type === "signature_required") return "/firmas";
  return contractId ? "/contratos/" + contractId : "/contratos";
}

export async function unreadCount(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(sql`${notifications.userId} = ${userId} and ${notifications.readAt} is null`);
  return row!.count;
}

export async function publishUnread(userId: string) {
  eventBus.publish(userId, { type: "unread-count", data: { count: await unreadCount(userId) } });
}

export function queueNotification(
  tx: Transaction,
  notification: typeof notifications.$inferSelect,
) {
  afterCommit(tx, async () => {
    eventBus.publish(notification.userId, {
      type: "notification",
      data: { ...notification, link: notification.actionUrl },
    });
    await publishUnread(notification.userId);
  });
}

export async function addNotification(tx: Transaction, input: typeof notifications.$inferInsert) {
  const [notification] = await tx
    .insert(notifications)
    .values(input)
    .onConflictDoNothing()
    .returning();
  if (notification) {
    await enqueueNotificationMail(tx, notification);
    queueNotification(tx, notification);
  }
  return notification;
}

export async function listNotifications(
  userId: string,
  query: { unread?: "true" | "false"; page: number; pageSize: number },
) {
  const filter = and(
    eq(notifications.userId, userId),
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
}

export async function readAllNotifications(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  await publishUnread(userId);
  return { message: "Notificaciones leídas." };
}

export async function updateNotification(userId: string, id: string, action: "read" | "delete") {
  const filter = and(eq(notifications.id, id), eq(notifications.userId, userId));
  const rows =
    action === "read"
      ? await db.update(notifications).set({ readAt: new Date() }).where(filter).returning()
      : await db.delete(notifications).where(filter).returning();
  if (!rows.length) throw notFound();
  await publishUnread(userId);
  return { message: "Notificación actualizada." };
}

export async function getNotificationPreferences(userId: string) {
  const [user] = await db
    .select({ preferences: users.notificationPreferences })
    .from(users)
    .where(eq(users.id, userId));
  return user!.preferences;
}

export async function updateNotificationPreferences(
  userId: string,
  patch: Partial<NotificationPreferences>,
) {
  const [user] = await db
    .update(users)
    .set({
      notificationPreferences: sql`${users.notificationPreferences} || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(eq(users.id, userId))
    .returning();
  return user!.notificationPreferences;
}
