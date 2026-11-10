import { z } from "zod";
import { users, userRole } from "../../db/schema.js";
export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-zA-Z]/)
  .regex(/[0-9]/);
export const profile = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40),
  cedula: z.string().trim().max(40),
});
export const idParams = z.object({ id: z.string().uuid() });
export const role = z.enum(userRole.enumValues);
export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  role: role.optional(),
  sort: z
    .enum(["name", "-name", "email", "-email", "createdAt", "-createdAt"])
    .default("-createdAt"),
});
export const createUserBody = profile.extend({
  email,
  role: role.default("user"),
  password: password.optional(),
});
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
    phone: row.phone,
    cedula: row.cedula,
    role: row.role,
    avatarPath: row.avatarPath,
    emailConfirmedAt: row.emailConfirmedAt,
    isActive: row.isActive,
    deletedAt: row.deletedAt,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
export type PublicUser = ReturnType<typeof publicUser>;
