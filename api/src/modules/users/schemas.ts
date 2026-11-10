import { z } from "zod";
import { zCedula, zPhoneDo, zEmail, zPersonName, zPassword } from "../../lib/validation/zod.js";
import { users, userRole } from "../../db/schema.js";
export const email = zEmail;
export const password = zPassword;
export const profile = z
  .object({
    name: zPersonName,
    phone: zPhoneDo,
    cedula: zCedula,
    position: z.string().trim().max(120).nullable().optional(),
  })
  .strict();
export const idParams = z.object({ id: z.string().uuid() }).strict();
export const role = z.enum(userRole.enumValues);
export const listQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().max(200).optional(),
    role: role.optional(),
    status: z.enum(["active", "inactive", "invited"]).optional(),
    sort: z
      .enum(["name", "-name", "email", "-email", "createdAt", "-createdAt"])
      .default("-createdAt"),
  })
  .strict();
export const createUserBody = profile
  .extend({
    email,
    role: role.default("user"),
  })
  .strict();
export const patchUserBody = profile
  .partial()
  .extend({
    email: email.optional(),
    role: role.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
export function publicUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    position: row.position,
    phone: row.phone,
    cedula: row.cedula,
    role: row.role,
    avatarPath: row.avatarPath,
    emailConfirmedAt: row.emailConfirmedAt,
    isActive: row.isActive,
    deletedAt: row.deletedAt,
    lastLoginAt: row.lastLoginAt,
    invitedAt: row.invitedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
export type PublicUser = ReturnType<typeof publicUser>;
export function userStatus(row: typeof users.$inferSelect) {
  if (!row.isActive) return "inactive";
  return row.invitedAt && row.mustChangePassword ? "invited" : "active";
}
