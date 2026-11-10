import nodemailer from "nodemailer";
import { env } from "../config/env.js";
export interface Mail {
  to: string;
  subject: string;
  text: string;
}
export type Mailer = (mail: Mail) => Promise<void>;
const smtp = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : undefined;
const development = nodemailer.createTransport({ jsonTransport: true });
export const sendMail: Mailer = async (mail) => {
  const message = { from: env.MAIL_FROM, ...mail };
  if (smtp) {
    await smtp.sendMail(message);
  } else {
    const result = await development.sendMail(message);
    console.log(result.message.toString());
  }
};
