import { sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { notifications } from "../../db/schema.js";
import { afterCommit, eventBus } from "../../lib/events.js";
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
  if (notification) queueNotification(tx, notification);
  return notification;
}
