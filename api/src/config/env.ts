import "dotenv/config";
import { isIP } from "node:net";
import { z } from "zod";
const databaseUrl = z
  .string()
  .url()
  .refine((v) => ["postgres:", "postgresql:"].includes(new URL(v).protocol));
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: databaseUrl,
  DATABASE_URL_TEST: databaseUrl.optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  APP_URL: z.string().url(),
  TRUST_PROXY: z
    .string()
    .default("false")
    .transform((v, ctx) => {
      if (v === "true" || v === "false") return v === "true";
      if (/^\d+$/.test(v)) return Number(v);
      const ips = v.split(",").map((s) => s.trim());
      if (
        ips.every(
          (ip) =>
            isIP(ip.split("/")[0]!) !== 0 &&
            (!ip.includes("/") ||
              (/^\d+$/.test(ip.split("/")[1]!) &&
                Number(ip.split("/")[1]) <= (isIP(ip.split("/")[0]!) === 4 ? 32 : 128))),
        )
      )
        return ips;
      ctx.addIssue({ code: "custom", message: "TRUST_PROXY inválido" });
      return z.NEVER;
    }),
  JOBS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  EXPIRY_WARNING_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SEED_PASSWORD: z.string().min(8).optional(),
  HOST: z
    .string()
    .refine(
      (value) => isIP(value) !== 0 || value === "localhost",
      "HOST debe ser una IP o localhost",
    )
    .default("127.0.0.1"),
  MAIL_DRIVER: z.enum(["resend", "smtp", "log"]).default("log"),
  MAIL_PAYLOAD_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, "Debe contener 32 bytes en hexadecimal")
    .optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  SETTINGS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, "Debe contener 32 bytes en hexadecimal")
    .optional(),
  SIGNING_KEY_PATH: z.string().min(1).optional(),
  SIGNING_CERT_PATH: z.string().min(1).optional(),
  SIGNING_KEY_PASSPHRASE: z.string().min(1).optional(),
  SIGNING_TRUST_PATH: z.string().min(1).optional(),
  SIGNATURE_BACKFILL_PENDING: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  MAIL_REPLY_TO: z.email().optional(),
  SMTP_URL: z
    .string()
    .url()
    .refine(
      (value) => ["smtp:", "smtps:"].includes(new URL(value).protocol),
      "SMTP_URL debe usar smtp:// o smtps://",
    )
    .optional(),
  MAIL_FROM: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) =>
        !/[\r\n]/.test(value) &&
        z.email().safeParse(value.match(/<([^<>]+)>$/)?.[1] ?? value).success,
      "MAIL_FROM debe contener una dirección de correo válida",
    )
    .optional(),
});
export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success)
    throw new Error(
      "Configuración inválida: " +
        parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join(", "),
    );
  const config = parsed.data;
  if (config.NODE_ENV === "test" && !config.DATABASE_URL_TEST)
    throw new Error("DATABASE_URL_TEST es obligatoria durante las pruebas");
  if (config.NODE_ENV === "production" && config.MAIL_DRIVER === "log")
    throw new Error("MAIL_DRIVER debe ser resend o smtp en producción");
  if (config.MAIL_DRIVER !== "log" && !config.MAIL_FROM)
    throw new Error("MAIL_FROM es obligatorio para enviar correo");
  if (config.MAIL_DRIVER === "resend" && !config.RESEND_API_KEY)
    throw new Error("RESEND_API_KEY es obligatoria con MAIL_DRIVER=resend");
  if (config.MAIL_DRIVER === "smtp" && !config.SMTP_URL)
    throw new Error("SMTP_URL es obligatorio con MAIL_DRIVER=smtp");
  if (config.NODE_ENV !== "test" && !config.MAIL_PAYLOAD_KEY)
    throw new Error("MAIL_PAYLOAD_KEY es obligatoria fuera de test");
  if (config.NODE_ENV !== "test" && !config.SETTINGS_ENCRYPTION_KEY)
    throw new Error("SETTINGS_ENCRYPTION_KEY es obligatoria fuera de test");
  if (config.NODE_ENV === "production" && (!config.SIGNING_KEY_PATH || !config.SIGNING_CERT_PATH))
    throw new Error("SIGNING_KEY_PATH y SIGNING_CERT_PATH son obligatorias en producción");
  return parsed.data;
}
export const env = loadEnv();
