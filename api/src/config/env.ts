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
  DATABASE_URL_TEST: databaseUrl,
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
  SMTP_URL: z.string().url().optional(),
  MAIL_FROM: z.string().default("SIMAUD <no-reply@simaud.local>"),
});
export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success)
    throw new Error(
      "Configuración inválida: " +
        parsed.error.issues.map((i) => i.path.join(".") + ": " + i.code).join(", "),
    );
  if (parsed.data.NODE_ENV === "production" && !parsed.data.SMTP_URL)
    throw new Error("SMTP_URL es obligatorio en producción");
  return parsed.data;
}
export const env = loadEnv();
