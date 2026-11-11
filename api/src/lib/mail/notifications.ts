import { eq } from "drizzle-orm";
import type { Transaction } from "../../db/client.js";
import { users, type notifications } from "../../db/schema.js";
import { enqueueMail } from "./outbox.js";
import { mailTemplates, type MailTemplate } from "./templates/index.js";
export async function enqueueNotificationMail(
  tx: Transaction,
  notification: typeof notifications.$inferSelect,
) {
  if (!mailTemplates.includes(notification.type as MailTemplate)) return;
  const [user] = await tx.select().from(users).where(eq(users.id, notification.userId));
  if (!user?.isActive || user.deletedAt) return;
  const preferences = user.notificationPreferences;
  const enabled =
    notification.type === "signature_required"
      ? preferences.emailOnSignatureRequired
      : notification.type === "contract_expiring"
        ? preferences.emailOnExpiry
        : preferences.emailOnApprovalResult;
  if (!enabled) return;
  const data = notification.data as Record<string, unknown>;
  await enqueueMail(
    tx,
    user.email,
    "SIMAUD: " + (typeof data.code === "string" ? data.code : notification.title),
    notification.type as MailTemplate,
    {
      name: user.name,
      message: notification.message,
      contractId: typeof data.contractId === "string" ? data.contractId : undefined,
      code: typeof data.code === "string" ? data.code : undefined,
      title: notification.title,
    },
  );
}
