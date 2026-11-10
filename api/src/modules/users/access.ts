import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { ApiError } from "../../lib/errors.js";
import { issueAuthToken, lockUser, revokeSessions } from "../auth/service.js";
import { auditAdmin, type AuditActor } from "../audit/service.js";

export async function sendAccessLink(actor: AuditActor, id: string, invitation: boolean) {
  await db.transaction(async (tx) => {
    const user = await lockUser(tx, id);
    if (!user || user.deletedAt) throw new ApiError(404, "NOT_FOUND", "No se encontró el usuario.");
    if (invitation && (!user.invitedAt || !user.mustChangePassword))
      throw new ApiError(409, "CONFLICT", "El usuario ya activó su cuenta.");
    if (!user.isActive)
      throw new ApiError(409, "CONFLICT", "Activa la cuenta antes de enviar el enlace.");
    await issueAuthToken(tx, user, "password_reset", user.email, invitation);
    await revokeSessions(tx, id);
    if (invitation) await tx.update(users).set({ invitedAt: new Date() }).where(eq(users.id, id));
    await auditAdmin(tx, actor, {
      area: "users",
      action: invitation ? "user.invite_resent" : "user.password_reset",
      targetType: "user",
      targetId: id,
      targetLabel: user.name,
    });
  });
  return { message: invitation ? "Invitación enviada." : "Enlace de restablecimiento enviado." };
}
