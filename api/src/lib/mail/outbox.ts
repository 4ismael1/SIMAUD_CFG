import type { Transaction } from "../../db/client.js";
import { emailOutbox } from "../../db/schema.js";
import type { MailPayload, MailTemplate } from "./templates/index.js";
export async function enqueueMail(
  tx: Transaction,
  to: string,
  subject: string,
  template: MailTemplate,
  payload: MailPayload = {},
) {
  const [mail] = await tx
    .insert(emailOutbox)
    .values({ to, subject, template, payload })
    .returning({ id: emailOutbox.id });
  return mail!;
}
