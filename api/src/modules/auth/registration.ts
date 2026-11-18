import { eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { hashPassword } from "../../lib/auth/password.js";
import { ApiError } from "../../lib/errors.js";
import { enqueueMail } from "../../lib/mail/outbox.js";
import { issueAuthToken, lockUser } from "./service.js";

const registrationMessage = { message: "Revisa tu correo." };
async function notifyExistingAccount(tx: Transaction, email: string) {
  const [candidate] = await tx.select().from(users).where(eq(users.email, email));
  if (!candidate) return false;
  const user = await lockUser(tx, candidate.id);
  if (!user) return false;
  await enqueueMail(tx, user.email, "Ya tienes cuenta en SIMAUD", "account_exists", {
    name: user.name,
    message: "Ya tienes cuenta en SIMAUD. ¿Olvidaste tu contraseña? Puedes restablecerla.",
  });
  return true;
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
    else if (!(await notifyExistingAccount(tx, input.email)))
      // Owner's decision: say so in the form instead of a silent "check your email" that never comes.
      throw new ApiError(409, "CONFLICT", "La cédula ya está registrada.", { field: "cedula" });
  });
  return registrationMessage;
}
