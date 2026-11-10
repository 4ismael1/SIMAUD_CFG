/** DEV ONLY: sets SEED_PASSWORD on the four seed accounts. Refuses to run in production. */
import { inArray } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "./client.js";
import { users } from "./schema.js";
import { hashPassword } from "../lib/auth/password.js";

const SEED_EMAILS = [
  "admin@simaud.local",
  "supervisor@simaud.local",
  "gestor@simaud.local",
  "usuario@simaud.local",
];

async function main() {
  if (env.NODE_ENV === "production") throw new Error("No se permite en producción.");
  if (!env.SEED_PASSWORD) throw new Error("Define SEED_PASSWORD en api/.env.");
  const passwordHash = await hashPassword(env.SEED_PASSWORD);
  const updated = await db
    .update(users)
    .set({ passwordHash })
    .where(inArray(users.email, SEED_EMAILS))
    .returning({ email: users.email });
  console.log(`Contraseña actualizada en ${updated.length} cuentas seed.`);
  process.exit(0);
}

void main();
