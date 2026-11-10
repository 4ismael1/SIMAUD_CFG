import { afterCommit, eventBus } from "../../lib/events.js";
import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import { users, authTokens } from "../../db/schema.js";
import { ApiError, unauthorized } from "../../lib/errors.js";
import { hashPassword } from "../../lib/auth/password.js";
import type { Mailer } from "../../lib/mailer.js";
import { active, issueAuthToken, lockUser, revokeSessions } from "../auth/service.js";
import { publicUser, type listQuery, type createUserBody, type patchUserBody } from "./schemas.js";
const notFound = () => new ApiError(404, "NOT_FOUND", "No se encontró el usuario.");
export async function findUser(id: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)));
  if (!user) throw notFound();
  return publicUser(user);
}
export async function listUsers(query: z.infer<typeof listQuery>) {
  const { page, pageSize, q, role, sort } = query;
  const search = q?.replace(/[\\%_]/g, "\\$&");
  const filter = and(
    isNull(users.deletedAt),
    role ? eq(users.role, role) : undefined,
    search
      ? or(
          ilike(users.name, "%" + search + "%"),
          ilike(users.email, "%" + search + "%"),
          ilike(users.cedula, "%" + search + "%"),
        )
      : undefined,
  );
  const column =
    sort.replace("-", "") === "name"
      ? users.name
      : sort.replace("-", "") === "email"
        ? users.email
        : users.createdAt;
  return db.transaction(
    async (tx) => {
      const rows = await tx
        .select()
        .from(users)
        .where(filter)
        .orderBy(sort.startsWith("-") ? desc(column) : asc(column), asc(users.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const [total] = await tx.select({ value: count() }).from(users).where(filter);
      return {
        data: rows.map(publicUser),
        meta: { page, pageSize, total: total!.value },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function createUser(input: z.infer<typeof createUserBody>, send: Mailer) {
  const passwordHash = await hashPassword(input.password ?? randomBytes(48).toString("hex"));
  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        phone: input.phone,
        cedula: input.cedula,
        role: input.role,
        passwordHash,
        emailConfirmedAt: new Date(),
      })
      .returning();
    return {
      user: publicUser(user!),
      mail: input.password ? null : await issueAuthToken(tx, user!, "password_reset"),
    };
  });
  if (result.mail) await send(result.mail);
  return { user: result.user };
}
export async function changeUser(
  actorId: string,
  id: string,
  input: z.infer<typeof patchUserBody>,
  remove = false,
) {
  return db.transaction(async (tx) => {
    // Serialize admin membership changes so concurrent demotions cannot remove every admin.
    await tx.execute(sql`select pg_advisory_xact_lock(10401)`);
    const actor = await lockUser(tx, actorId);
    if (!active(actor) || actor.role !== "admin") throw unauthorized();
    const user = id === actorId ? actor : await lockUser(tx, id);
    if (!user || user.deletedAt) throw notFound();
    if (
      actorId === id &&
      (remove || (input.role && input.role !== "admin") || input.isActive === false)
    )
      throw new ApiError(
        409,
        "CONFLICT",
        "No puedes eliminar, desactivar ni quitar el rol admin de tu propia cuenta.",
      );
    const losingAdmin =
      user.role === "admin" &&
      (remove || (input.role && input.role !== "admin") || input.isActive === false);
    if (losingAdmin) {
      const [others] = await tx
        .select({ value: count() })
        .from(users)
        .where(
          and(
            eq(users.role, "admin"),
            eq(users.isActive, true),
            isNull(users.deletedAt),
            ne(users.id, id),
          ),
        );
      if (!others!.value)
        throw new ApiError(409, "CONFLICT", "Debe existir al menos un administrador activo.");
    }
    const emailChanged = input.email !== undefined && input.email !== user.email;
    const [updated] = await tx
      .update(users)
      .set(
        remove
          ? { deletedAt: new Date(), isActive: false }
          : { ...input, ...(emailChanged ? { pendingEmail: null } : {}) },
      )
      .where(eq(users.id, id))
      .returning();
    if (
      remove ||
      input.isActive === false ||
      (input.role && input.role !== user.role) ||
      emailChanged
    ) {
      await revokeSessions(tx, id);
      await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.userId, id));
    }
    if (input.role && input.role !== user.role)
      afterCommit(tx, () =>
        eventBus.publish(id, { type: "role-changed", data: { role: input.role } }),
      );
    return publicUser(updated!);
  });
}
