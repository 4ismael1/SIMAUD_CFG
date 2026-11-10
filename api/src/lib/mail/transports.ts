import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { MailDeliveryError, type MailMessage, type MailTransport } from "./transport.js";

type MailConfig = Pick<
  typeof env,
  "MAIL_DRIVER" | "MAIL_FROM" | "MAIL_REPLY_TO" | "SMTP_URL" | "RESEND_API_KEY"
>;
export function resendTransport(config: MailConfig, request: typeof fetch = fetch): MailTransport {
  return {
    async send(message) {
      let response: Response;
      try {
        response = await request("https://api.resend.com/emails", {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: "Bearer " + config.RESEND_API_KEY,
            "Content-Type": "application/json",
            ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
          },
          body: JSON.stringify({
            from: config.MAIL_FROM,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
            reply_to: config.MAIL_REPLY_TO,
          }),
        });
      } catch {
        // Provider exceptions can contain credentials or token-bearing bodies.
        throw new MailDeliveryError(true, "RESEND_CONNECTION");
      }
      if (!response.ok)
        throw new MailDeliveryError(
          response.status === 429 || response.status >= 500 || response.status === 408,
          "HTTP_" + response.status,
        );
      const result: unknown = await response.json().catch(() => null);
      return {
        id:
          result && typeof result === "object" && "id" in result && typeof result.id === "string"
            ? result.id
            : undefined,
      };
    },
  };
}
export function smtpTransport(
  config: MailConfig,
  create = nodemailer.createTransport,
): MailTransport {
  const smtp = create({
    url: config.SMTP_URL!,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  } as SMTPTransport.Options);
  return {
    async send(message) {
      try {
        const result = await smtp.sendMail({
          from: config.MAIL_FROM,
          replyTo: config.MAIL_REPLY_TO,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          ...(message.idempotencyKey
            ? { messageId: "<" + message.idempotencyKey + "@simaud>" }
            : {}),
        });
        if (result.rejected?.length) throw new MailDeliveryError(false, "SMTP_REJECTED");
        return { id: result.messageId };
      } catch (error) {
        if (error instanceof MailDeliveryError) throw error;
        const responseCode =
          typeof error === "object" && error !== null && "responseCode" in error
            ? Number(error.responseCode)
            : 0;
        throw new MailDeliveryError(
          responseCode < 500,
          responseCode ? "SMTP_" + responseCode : "SMTP_CONNECTION",
        );
      }
    },
  };
}
export function logTransport(log: (entry: object) => void = console.info): MailTransport {
  return {
    async send(message: MailMessage) {
      log({ to: message.to, subject: message.subject, type: message.template });
      return {};
    },
  };
}
export function createMailTransport(config: MailConfig = env): MailTransport {
  if (config.MAIL_DRIVER === "resend") return resendTransport(config);
  if (config.MAIL_DRIVER === "smtp") return smtpTransport(config);
  return logTransport();
}
