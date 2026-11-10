import { eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { hashPassword } from "../../lib/auth/password.js";
import { enqueueMail } from "../../lib/mail/outbox.js";
import { issueAuthToken, lockUser } from "./service.js";

const registrationMessage = { message: "Revisa tu correo." };
async function notifyExistingAccount(tx: Transaction, email: string) {
  const [candidate] = await tx.select().from(users).where(eq(users.email, email));
  if (!candidate) return;
  const user = await lockUser(tx, candidate.id);
  if (!user) return;
  await enqueueMail(tx, user.email, "Ya tienes cuenta en SIMAUD", "account_exists", {
    name: user.name,
    message: "Ya tienes cuenta en SIMAUD. ¿Olvidaste tu contraseña? Puedes restablecerla.",
  });
}
export async function register(input: {
  email: string;
  password: string;
  name: string;
  phone: string;
  cedula: string;
}) {
  // Every valid registration pays the same password cost, including conflicts.
  const passwordHash = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        name: input.name,
        phone: input.phone,
        cedula: input.cedula,
        role: "user",
      })
      .onConflictDoNothing()
      .returning();
    if (user) await issueAuthToken(tx, user, "email_confirmation");
    else await notifyExistingAccount(tx, input.email);
  });
  return registrationMessage;
}
