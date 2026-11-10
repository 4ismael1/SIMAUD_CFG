import { createMailTransport } from "./mail/transports.js";
import type { MailMessage } from "./mail/transport.js";
export type Mail = MailMessage;
export type Mailer = (mail: Mail) => Promise<{ id?: string } | void>;
let transport: ReturnType<typeof createMailTransport> | undefined;
export const sendMail: Mailer = (mail) => (transport ??= createMailTransport()).send(mail);
