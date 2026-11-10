import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { authTokens, refreshTokens, users } from "../../db/schema.js";
import { ApiError, invalidCredentials, unauthorized } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "../../lib/auth/password.js";
import { createAccessToken } from "../../lib/auth/jwt.js";
import { enqueueMail } from "../../lib/mail/outbox.js";
import { publicUser } from "../users/schemas.js";
export const randomToken = () => randomBytes(32).toString("hex");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const active = (u: typeof users.$inferSelect | undefined): u is typeof users.$inferSelect =>
  !!u && u.isActive && !u.deletedAt;
export async function lockUser(tx: Transaction, id: string) {
  const [user] = await tx.select().from(users).where(eq(users.id, id)).for("update");
  return user;
}
export async function revokeSessions(tx: Transaction, userId: string, exceptId?: string) {
  await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        exceptId ? ne(refreshTokens.id, exceptId) : undefined,
      ),
    );
}
export async function issueAuthToken(
  tx: Transaction,
  user: typeof users.$inferSelect,
  type: "email_confirmation" | "password_reset",
  destination = user.email,
  invitation = false,
) {
  // Invalidate older tokens of the same purpose. Caller holds the user lock.
  await tx
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(eq(authTokens.userId, user.id), eq(authTokens.type, type), isNull(authTokens.usedAt)),
    );
  const token = randomToken();
  await tx.insert(authTokens).values({
    userId: user.id,
    type,
    tokenHash: tokenHash(token),
    email: destination,
    expiresAt: new Date(Date.now() + (type === "email_confirmation" ? 24 : 1) * 3600000),
  });
  return enqueueMail(
    tx,
    destination,
    invitation
      ? "Te invitamos a SIMAUD"
      : type === "email_confirmation"
        ? "Confirma tu email en SIMAUD"
        : "Restablece tu contraseña de SIMAUD",
    invitation ? "invitation" : type,
    { name: user.name, token },
  );
}
export async function newSession(
  tx: Transaction,
  userId: string,
  context: { ip?: string; userAgent?: string },
  familyId: string = randomUUID(),
) {
  const token = randomToken();
  const [row] = await tx
    .insert(refreshTokens)
    .values({
      userId,
      tokenHash: tokenHash(token),
      familyId,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      ip: context.ip,
      userAgent: context.userAgent,
    })
    .returning();
  return { token, id: row!.id };
}
export async function register(input: {
  email: string;
  password: string;
  name: string;
  phone: string;
  cedula: string;
}) {
  const passwordHash = await hashPassword(input.password);
  const result = await db.transaction(async (tx) => {
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
      .returning();
    await issueAuthToken(tx, user!, "email_confirmation");
    return { user: publicUser(user!) };
  });
  return {
    user: result.user,
    message: "Revisa tu email para confirmar la cuenta.",
  };
}
// A dummy hash makes nonexistent users perform the same password work.
let dummyHash: Promise<string> | undefined;
export async function login(
  email: string,
  password: string,
  context: { ip?: string; userAgent?: string },
) {
  const [candidate] = await db.select().from(users).where(eq(users.email, email));
  const hash = candidate?.passwordHash ?? (await (dummyHash ??= hashPassword(randomToken())));
  const valid = await verifyPassword(hash, password);
  if (!candidate || !valid) throw invalidCredentials();
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, candidate.id);
    if (!active(user) || user.passwordHash !== candidate.passwordHash) throw invalidCredentials();
    if (!user.emailConfirmedAt)
      throw new ApiError(403, "EMAIL_NOT_CONFIRMED", "Confirma tu email antes de iniciar sesión.");
    const [updated] = await tx
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    const session = await newSession(tx, user.id, context);
    return {
      accessToken: await createAccessToken(user, session.id),
      user: { ...publicUser(updated!), mustChangePassword: updated!.mustChangePassword },
      refreshToken: session.token,
    };
  });
}
export async function refresh(
  raw: string | undefined,
  context: { ip?: string; userAgent?: string },
) {
  if (!raw) throw unauthorized();
  const [candidate] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash(raw)));
  if (!candidate) throw unauthorized();
  const result = await db.transaction(async (tx) => {
    const user = await lockUser(tx, candidate.userId);
    const [old] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, candidate.id))
      .for("update");
    if (!old) return null;
    if (old.revokedAt) {
      if (old.replacedBy && Date.now() - old.revokedAt.getTime() < 15000)
        throw new ApiError(
          409,
          "REFRESH_RACE",
          "Otra pestaña ha renovado la sesión. Reintenta con la cookie actual.",
        );
      // Return an error sentinel so the revocation is committed, never rolled back by throwing.
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.familyId, old.familyId));
      return null;
    }
    if (!active(user) || !user.emailConfirmedAt || old.expiresAt <= new Date()) return null;
    if (user.mustChangePassword)
      throw new ApiError(
        403,
        "PASSWORD_CHANGE_REQUIRED",
        "Debes cambiar tu contraseña temporal antes de renovar la sesión.",
      );
    const next = await newSession(tx, user.id, context, old.familyId);
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedBy: next.id })
      .where(eq(refreshTokens.id, old.id));
    return {
      accessToken: await createAccessToken(user, next.id),
      refreshToken: next.token,
    };
  });
  if (!result) throw unauthorized();
  return result;
}
export async function logout(raw: string | undefined) {
  if (raw)
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash(raw)));
}
export async function requestToken(email: string, type: "email_confirmation" | "password_reset") {
  const [candidate] = await db.select().from(users).where(eq(users.email, email));
  if (!active(candidate)) return;
  await db.transaction(async (tx) => {
    const user = await lockUser(tx, candidate.id);
    if (!active(user) || (type === "email_confirmation" && user.emailConfirmedAt)) return null;
    return issueAuthToken(tx, user, type);
  });
}
export async function consumeToken(
  raw: string,
  type: "email_confirmation" | "password_reset",
  password?: string,
) {
  const [candidate] = await db
    .select()
    .from(authTokens)
    .where(eq(authTokens.tokenHash, tokenHash(raw)));
  const invalid = () =>
    new ApiError(400, "VALIDATION_ERROR", "El enlace no es válido o ha expirado.");
  if (!candidate || candidate.type !== type) throw invalid();
  const passwordHash = password ? await hashPassword(password) : undefined;
  await db.transaction(async (tx) => {
    const user = await lockUser(tx, candidate.userId);
    const [token] = await tx
      .select()
      .from(authTokens)
      .where(eq(authTokens.id, candidate.id))
      .for("update");
    if (!active(user) || !token || token.usedAt || token.expiresAt <= new Date()) throw invalid();
    if (type === "email_confirmation") {
      if (token.email !== user.email && token.email !== user.pendingEmail) throw invalid();
      await tx
        .update(users)
        .set({
          email: token.email!,
          pendingEmail: null,
          emailConfirmedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    } else {
      if (!passwordHash) throw invalid();
      if (
        user.mustChangePassword &&
        password &&
        (await verifyPassword(user.passwordHash, password))
      )
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Elige una contraseña distinta de la temporal.",
        );
      await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: false })
        .where(eq(users.id, user.id));
    }
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, token.id));
    await revokeSessions(tx, user.id);
  });
}
