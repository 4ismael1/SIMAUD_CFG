import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, createHash } from "node:crypto";
import { env } from "../config/env.js";
import { StorageError } from "./storage-types.js";

const magic = Buffer.from("SIMAUDSIG1");
export const isEncryptedSignature = (bytes: Buffer) =>
  bytes.subarray(0, magic.length).equals(magic);
const logicalKey = (key: string) => key.replace(/^trash\/\d{4}-\d{2}-\d{2}\//, "");
const signatureKey = () =>
  hkdfSync(
    "sha256",
    Buffer.from(env.SETTINGS_ENCRYPTION_KEY ?? "11".repeat(32), "hex"),
    Buffer.alloc(0),
    "simaud:signature-storage:v1",
    32,
  );

export function encryptFile(key: string, bytes: Buffer) {
  if (!logicalKey(key).startsWith("signatures/")) return bytes;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", signatureKey(), iv);
  cipher.setAAD(Buffer.from(logicalKey(key)));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted]);
}

export function decryptFile(key: string, bytes: Buffer) {
  if (!logicalKey(key).startsWith("signatures/")) return bytes;
  if (!isEncryptedSignature(bytes)) {
    if (env.NODE_ENV === "test" || env.SIGNATURE_BACKFILL_PENDING) return bytes;
    throw new StorageError(
      "conflict",
      "Firma sin cifrado autenticado. Ejecuta el backfill de firmas antes de continuar.",
    );
  }
  try {
    const offset = magic.length;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      signatureKey(),
      bytes.subarray(offset, offset + 12),
    );
    decipher.setAAD(Buffer.from(logicalKey(key)));
    decipher.setAuthTag(bytes.subarray(offset + 12, offset + 28));
    return Buffer.concat([decipher.update(bytes.subarray(offset + 28)), decipher.final()]);
  } catch {
    throw new StorageError(
      "conflict",
      "La firma no supera la verificación de integridad. Revisa la clave de cifrado.",
    );
  }
}

export function legacySignatureReplacement(key: string, bytes: Buffer, expectedSha256?: string) {
  if (!key.startsWith("signatures/"))
    throw new StorageError("invalid", "Solo se pueden migrar firmas.");
  const plain = isEncryptedSignature(bytes) ? decryptFile(key, bytes) : bytes;
  const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
  if (expectedSha256 && hash(plain) !== expectedSha256)
    throw new StorageError("conflict", "La firma de destino no coincide con el origen.");
  if (isEncryptedSignature(bytes)) return null;
  const encrypted = encryptFile(key, plain);
  if (hash(decryptFile(key, encrypted)) !== hash(plain))
    throw new StorageError("conflict", "No se pudo verificar la firma cifrada.");
  return encrypted;
}
