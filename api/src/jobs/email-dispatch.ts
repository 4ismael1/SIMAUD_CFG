import { and, eq, lte, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { emailOutbox } from "../db/schema.js";
import { sendMail, type Mailer } from "../lib/mailer.js";
import { MailDeliveryError } from "../lib/mail/transport.js";
import { renderMail } from "../lib/mail/templates/index.js";
import { decryptPayload, payloadContext } from "../lib/mail/payload.js";

async function deliver(row: typeof emailOutbox.$inferSelect, mailer: Mailer, now: Date) {
  const attempts = row.attempts + 1;
  try {
    const result = await mailer({
      to: row.to,
      subject: row.subject,
      template: row.template,
      idempotencyKey: row.id,
      ...renderMail(
        row.template,
        row.encryptedPayload
          ? decryptPayload(row.encryptedPayload, payloadContext(row.to, row.template))
          : row.payload,
      ),
    });
    return {
      attempts,
      status: "sent" as const,
      sentAt: now,
      providerId: result?.id ?? null,
      lastError: null,
      // Retain no token-bearing payload after successful delivery.
      payload: {},
      encryptedPayload: null,
    };
  } catch (error) {
    const temporary = !(error instanceof MailDeliveryError) || error.temporary;
    const failed = !temporary || attempts >= 6;
    return {
      attempts,
      status: failed ? ("failed" as const) : ("pending" as const),
      nextAttemptAt: new Date(now.getTime() + 60000 * 2 ** (attempts - 1)),
      // Even provider-defined exceptions may contain a token or request body.
      lastError: failed ? "No se pudo entregar el correo." : "Error temporal de entrega.",
      ...(failed ? { payload: {}, encryptedPayload: null } : {}),
    };
  }
}
export async function dispatchEmails(mailer: Mailer = sendMail, now = new Date()) {
  const summary = { sent: 0, pending: 0, failed: 0 };
  await db
    .update(emailOutbox)
    .set({
      payload: {},
      encryptedPayload: null,
      status: "failed",
      lastError: "El correo ha expirado.",
    })
    .where(
      and(
        isNotNull(emailOutbox.expiresAt),
        lte(emailOutbox.expiresAt, now),
        or(
          eq(emailOutbox.status, "pending"),
          isNotNull(emailOutbox.encryptedPayload),
          sql`${emailOutbox.payload} <> '{}'::jsonb`,
        ),
      ),
    );
  // Row locks also protect direct invocations outside the scheduler advisory lock.
  for (let index = 0; index < 100; index++) {
    const status = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(emailOutbox)
        .where(and(eq(emailOutbox.status, "pending"), lte(emailOutbox.nextAttemptAt, now)))
        .orderBy(emailOutbox.nextAttemptAt, emailOutbox.id)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!row) return null;
      const changes = await deliver(row, mailer, now);
      await tx.update(emailOutbox).set(changes).where(eq(emailOutbox.id, row.id));
      return changes.status;
    });
    if (!status) break;
    summary[status]++;
  }
  return summary;
}
