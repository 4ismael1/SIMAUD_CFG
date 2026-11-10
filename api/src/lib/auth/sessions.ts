import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { authTokens, refreshTokens, users } from "../../db/schema.js";
import { afterCommit, eventBus } from "../events.js";

export type SessionIdentity = {
  userId: string;
  sessionId: string;
  role: string;
  credentialsVersion: number;
};
export async function sessionUser(identity: SessionIdentity, now = new Date()) {
  const [row] = await db
    .select({ user: users })
    .from(users)
    .innerJoin(refreshTokens, eq(refreshTokens.userId, users.id))
    .where(
      and(
        eq(users.id, identity.userId),
        eq(refreshTokens.familyId, identity.sessionId),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, now),
        eq(users.credentialsVersion, identity.credentialsVersion),
      ),
    )
    .limit(1);
  const user = row?.user;
  if (!user?.isActive || user.deletedAt || !user.emailConfirmedAt || user.role !== identity.role)
    return undefined;
  return user;
}
export function notifyRevocation(
  tx: Transaction,
  userId: string,
  sessionId?: string,
  exceptId?: string,
) {
  afterCommit(tx, () =>
    eventBus.publish(userId, {
      type: "session-revoked",
      data: { sessionId, exceptId },
    }),
  );
}
export async function revokeSessions(tx: Transaction, userId: string, exceptId?: string) {
  await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        exceptId ? ne(refreshTokens.familyId, exceptId) : undefined,
      ),
    );
  if (!exceptId)
    await tx
      .update(users)
      .set({ credentialsVersion: sql`${users.credentialsVersion} + 1` })
      .where(eq(users.id, userId));
  notifyRevocation(tx, userId, undefined, exceptId);
}
export async function invalidatePasswordResets(tx: Transaction, userId: string) {
  await tx
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.type, "password_reset"),
        isNull(authTokens.usedAt),
      ),
    );
}
