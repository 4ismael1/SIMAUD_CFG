import { randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { verificationCodes } from "../../db/schema.js";

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function generateVerificationCode() {
  const symbols = [...randomBytes(16)].map((byte) => alphabet[byte & 31]).join("");
  return symbols.match(/.{4}/g)!.join("-");
}
export function normalizeVerificationCode(value: string) {
  const compact = value.toUpperCase().replace(/-/g, "");
  if (/^SIM[0-9A-F]{20}$/.test(compact)) return compact;
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(compact) ? compact : null;
}
export async function findVerificationCode(
  value: string,
  connection: Transaction | typeof db = db,
) {
  const code = normalizeVerificationCode(value);
  if (!code) return undefined;
  const [row] = await connection
    .select()
    .from(verificationCodes)
    .where(eq(verificationCodes.code, code));
  const candidate = row?.code ?? "0".repeat(code.length);
  const equal = timingSafeEqual(Buffer.from(candidate), Buffer.from(code));
  return equal ? row : undefined;
}
