import type { Transaction } from "../../db/client.js";
import { emailOutbox } from "../../db/schema.js";
import type { MailPayload, MailTemplate } from "./templates/index.js";
import { encryptPayload, payloadContext } from "./payload.js";
export async function enqueueMail(
  tx: Transaction,
  to: string,
  subject: string,
  template: MailTemplate,
  payload: MailPayload = {},
  expiresAt?: Date,
) {
  const sensitive = payload.token !== undefined;
  const expiry =
    expiresAt ??
    (sensitive
      ? new Date(Date.now() + (template === "email_confirmation" ? 24 : 1) * 3600000)
      : undefined);
  const [mail] = await tx
    .insert(emailOutbox)
    .values({
      to,
      subject,
      template,
      payload: sensitive ? {} : payload,
      encryptedPayload: sensitive ? encryptPayload(payload, payloadContext(to, template)) : null,
      expiresAt: expiry,
    })
    .returning({ id: emailOutbox.id });
  return mail!;
}
