import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { ApiError, unauthorized } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "../../lib/auth/password.js";
import type { Mailer } from "../../lib/mailer.js";
import { active, issueAuthToken, lockUser, revokeSessions } from "../auth/service.js";
import { publicUser } from "../users/schemas.js";
export async function updateProfile(
  id: string,
  input: { name?: string; phone?: string; cedula?: string },
) {
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, id);
    if (!active(user)) throw unauthorized();
    const [updated] = await tx.update(users).set(input).where(eq(users.id, id)).returning();
    return publicUser(updated!);
  });
}
export async function changePassword(
  id: string,
  currentPassword: string,
  newPassword: string,
  sessionId?: string,
) {
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    const user = await lockUser(tx, id);
    if (!active(user)) throw unauthorized();
    if (!(await verifyPassword(user.passwordHash, currentPassword)))
      throw new ApiError(401, "INVALID_CREDENTIALS", "La contraseña actual no es correcta.");
    await tx.update(users).set({ passwordHash }).where(eq(users.id, id));
    await revokeSessions(tx, id, sessionId);
  });
}
export async function changeEmail(id: string, newEmail: string, password: string, send: Mailer) {
  const mail = await db.transaction(async (tx) => {
    const user = await lockUser(tx, id);
    if (!active(user)) throw unauthorized();
    if (!(await verifyPassword(user.passwordHash, password)))
      throw new ApiError(401, "INVALID_CREDENTIALS", "La contraseña no es correcta.");
    const [exists] = await tx.select({ id: users.id }).from(users).where(eq(users.email, newEmail));
    if (exists)
      throw new ApiError(409, "CONFLICT", "El email ya está registrado.", {
        field: "email",
      });
    await tx.update(users).set({ pendingEmail: newEmail }).where(eq(users.id, id));
    return issueAuthToken(tx, user, "email_confirmation", newEmail);
  });
  await send(mail);
}
