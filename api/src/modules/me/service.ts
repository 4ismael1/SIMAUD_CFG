import { and, eq, isNull, gt, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, refreshTokens } from "../../db/schema.js";
import { invalidatePasswordResets } from "../../lib/auth/sessions.js";
import { createAccessToken } from "../../lib/auth/jwt.js";
import { ApiError, unauthorized } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "../../lib/auth/password.js";
import { active, issueAuthToken, lockUser, revokeSessions } from "../auth/service.js";
import { publicUser } from "../users/schemas.js";
import { auditAdmin } from "../audit/service.js";
export async function updateProfile(
  id: string,
  input: { name?: string; phone?: string; cedula?: string; position?: string | null },
  ip?: string,
) {
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, id);
    if (!active(user)) throw unauthorized();
    // The cédula identifies a person when they are added as a signatory: anyone may fill it in once,
    // but changing it afterwards goes through an administrator (an admin may correct their own).
    const cedulaChanged = input.cedula !== undefined && input.cedula !== user.cedula;
    if (cedulaChanged && user.cedula && user.role !== "admin")
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Tu cédula ya está registrada. Para corregirla, pide el cambio a un administrador.",
      );
    const [updated] = await tx.update(users).set(input).where(eq(users.id, id)).returning();
    const audited = [
      ...(input.position !== undefined && input.position !== user.position ? ["position"] : []),
      ...(cedulaChanged ? ["cedula"] : []),
      ...(input.name !== undefined && input.name !== user.name ? ["name"] : []),
    ];
    if (audited.length)
      await auditAdmin(
        tx,
        { actorId: id, ip },
        {
          area: "users",
          action: "user.updated",
          targetType: "user",
          targetId: id,
          targetLabel: updated!.name,
          details: { fields: audited },
        },
      );
    return publicUser(updated!);
  });
}
export async function changePassword(
  id: string,
  currentPassword: string,
  newPassword: string,
  sessionId?: string,
) {
  if (currentPassword === newPassword)
    throw new ApiError(400, "VALIDATION_ERROR", "Elige una contraseña distinta de la actual.");
  const passwordHash = await hashPassword(newPassword);
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, id);
    if (!active(user)) throw unauthorized();
    if (!(await verifyPassword(user.passwordHash, currentPassword)))
      throw new ApiError(401, "INVALID_CREDENTIALS", "La contraseña actual no es correcta.");
    if (!sessionId) throw unauthorized();
    const [session] = await tx
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, id),
          eq(refreshTokens.familyId, sessionId),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!session) throw unauthorized();
    const [updated] = await tx
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
        credentialsVersion: sql`${users.credentialsVersion} + 1`,
      })
      .where(eq(users.id, id))
      .returning();
    await invalidatePasswordResets(tx, id);
    await revokeSessions(tx, id, sessionId);
    return { accessToken: await createAccessToken(updated!, sessionId) };
  });
}
export async function changeEmail(id: string, newEmail: string, password: string) {
  await db.transaction(async (tx) => {
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
    return issueAuthToken(tx, user, "email_confirmation", newEmail, false, true);
  });
}
