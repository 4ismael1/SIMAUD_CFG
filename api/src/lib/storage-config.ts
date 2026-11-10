import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, type Transaction } from "../db/client.js";
import { settings } from "../db/schema.js";
import { env } from "../config/env.js";
import { DiskStorage } from "./storage-disk.js";
import { S3Storage, isStorageEndpoint } from "./storage-s3.js";
import { StorageError, validateKey } from "./storage-types.js";

const endpoint = z
  .url()
  .refine(isStorageEndpoint, "Usa un endpoint HTTPS sin credenciales, ruta ni parámetros.")
  .transform((value) => new URL(value).origin);

export const storageInput = z.discriminatedUnion("driver", [
  z.object({ driver: z.literal("disk") }).strict(),
  z
    .object({
      driver: z.literal("s3"),
      endpoint,
      region: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .regex(/^[a-z0-9-]+$/),
      bucket: z
        .string()
        .min(3)
        .max(63)
        .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/),
      accessKeyId: z.string().trim().min(4).max(256),
      secretAccessKey: z.string().min(1).max(1024).optional(),
      prefix: z
        .string()
        .max(500)
        .default("")
        .refine((value) => {
          try {
            if (value) validateKey(value);
            return !value.startsWith("trash/");
          } catch {
            return false;
          }
        }, "Prefijo inválido."),
      forcePathStyle: z.boolean().default(false),
    })
    .strict(),
]);
export type StorageInput = z.infer<typeof storageInput>;
export type StorageConfig =
  { driver: "disk" } | (Extract<StorageInput, { driver: "s3" }> & { secretAccessKey: string });
export interface StorageState {
  active: StorageConfig;
  pending?: StorageConfig;
  migrating: boolean;
  migrationJobId?: string;
  retired?: StorageConfig[];
}

export function sameStorageLocation(left: StorageConfig, right: StorageConfig) {
  if (left.driver === "disk" || right.driver === "disk") return left.driver === right.driver;
  return (
    left.endpoint === right.endpoint && left.bucket === right.bucket && left.prefix === right.prefix
  );
}
const settingsKey = "storage";
const encryptionKey = () => Buffer.from(env.SETTINGS_ENCRYPTION_KEY ?? "11".repeat(32), "hex");

export function encryptStorage(state: StorageState) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from("simaud:settings:storage:v1"));
  const bytes = Buffer.concat([cipher.update(JSON.stringify(state)), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    data: bytes.toString("hex"),
  };
}

export async function readStorageState(): Promise<StorageState> {
  const [row] = await db.select().from(settings).where(eq(settings.key, settingsKey));
  if (!row) return { active: { driver: "disk" }, migrating: false };
  try {
    const encrypted = z
      .object({ version: z.literal(1), iv: z.string(), tag: z.string(), data: z.string() })
      .parse(row.value);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(encrypted.iv, "hex"),
    );
    decipher.setAAD(Buffer.from("simaud:settings:storage:v1"));
    decipher.setAuthTag(Buffer.from(encrypted.tag, "hex"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(encrypted.data, "hex")),
        decipher.final(),
      ]).toString("utf8"),
    ) as StorageState;
  } catch {
    throw new StorageError(
      "unreachable",
      "No se pudo descifrar la configuración de almacenamiento. Revisa SETTINGS_ENCRYPTION_KEY.",
    );
  }
}

export async function saveStorageState(state: StorageState, tx: Transaction | typeof db = db) {
  const value = encryptStorage(state);
  await tx
    .insert(settings)
    .values({ key: settingsKey, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export function publicConfig(config: StorageConfig) {
  if (config.driver === "disk") return { driver: "disk" as const };
  const { secretAccessKey, accessKeyId, ...safe } = config;
  return { ...safe, hasSecret: Boolean(secretAccessKey), accessKeyLast4: accessKeyId.slice(-4) };
}

export async function resolveConfig(input: StorageInput): Promise<StorageConfig> {
  if (input.driver === "disk") return input;
  const state = await readStorageState();
  const previous = state.pending?.driver === "s3" ? state.pending : state.active;
  const secret =
    input.secretAccessKey ?? (previous.driver === "s3" ? previous.secretAccessKey : undefined);
  if (!secret) throw new StorageError("invalid", "Introduce la clave secreta del proveedor.");
  return { ...input, secretAccessKey: secret };
}

export const createDriver = (config: StorageConfig) =>
  config.driver === "disk" ? new DiskStorage() : new S3Storage(config);
