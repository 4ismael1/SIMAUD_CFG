import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "../../config/env.js";
import type { MailPayload } from "./templates/index.js";

// The ephemeral test key never reaches disk. Real deployments must supply their own key.
const key = env.MAIL_PAYLOAD_KEY ? Buffer.from(env.MAIL_PAYLOAD_KEY, "hex") : randomBytes(32);
const payloadSchema = z
  .object({
    name: z.string().optional(),
    message: z.string().optional(),
    contractId: z.string().optional(),
    token: z.string().optional(),
  })
  .strict();
const envelopeSchema = z.object({
  version: z.literal(1),
  iv: z.string(),
  tag: z.string(),
  data: z.string(),
});
export function encryptPayload(payload: MailPayload, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}
export function decryptPayload(encrypted: string, context: string): MailPayload {
  const envelope = envelopeSchema.parse(JSON.parse(encrypted) as unknown);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"), {
    authTagLength: 16,
  });
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const data = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final(),
  ]);
  return payloadSchema.parse(JSON.parse(data.toString("utf8")) as unknown);
}
export const payloadContext = (to: string, template: string) => JSON.stringify([to, template]);
