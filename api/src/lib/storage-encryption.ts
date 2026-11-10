import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { StorageError } from "./storage-types.js";

const magic = Buffer.from("SIMAUDSIG1");
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
  // Existing evidence remains readable without rewriting its original bytes.
  if (!logicalKey(key).startsWith("signatures/") || !bytes.subarray(0, magic.length).equals(magic))
    return bytes;
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
