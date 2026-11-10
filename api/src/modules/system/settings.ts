import { z } from "zod";
import { db, type Transaction } from "../../db/client.js";
import { settings } from "../../db/schema.js";
import { env } from "../../config/env.js";
export const settingsSchema = z
  .object({
    expiryWarningDays: z.number().int().min(1).max(365),
    expiryNotificationDays: z
      .array(z.number().int().min(1).max(365))
      .min(1)
      .max(20)
      .refine((days) => new Set(days).size === days.length),
    institution: z
      .object({
        name: z.string().trim().min(1).max(200),
        rnc: z.string().max(50),
        address: z.string().max(1000),
        logo: z
          .string()
          .max(500000)
          .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
          .nullable()
          .optional(),
      })
      .strict(),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export async function getSettings(connection: Transaction | typeof db = db): Promise<Settings> {
  const defaults: Settings = {
    expiryWarningDays: env.EXPIRY_WARNING_DAYS,
    expiryNotificationDays: [30, 15, 7, 1],
    institution: { name: "SIMAUD", rnc: "", address: "", logo: null },
  };
  const rows = await connection.select().from(settings);
  return settingsSchema.parse({
    ...defaults,
    ...Object.fromEntries(rows.map((row) => [row.key, row.value])),
  });
}
