import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "../../plugins/auth.js";
import type { Mailer } from "../../lib/mailer.js";
import { email, password, profile } from "../users/schemas.js";
import * as service from "./service.js";
import { avatarName, deleteAvatar, getAvatar, uploadAvatar } from "./avatar.js";
export async function meRoutes(app: FastifyInstance, send: Mailer) {
  const a = app.withTypeProvider<ZodTypeProvider>();
  a.get("/me", { preHandler: authenticate }, async (r) => r.user);
  a.patch(
    "/me",
    {
      preHandler: authenticate,
      schema: {
        body: profile
          .partial()
          .strict()
          .refine((v) => Object.keys(v).length > 0),
      },
    },
    async (r) => ({ user: await service.updateProfile(r.user.id, r.body) }),
  );
  a.patch(
    "/me/password",
    {
      preHandler: authenticate,
      schema: {
        body: z.object({
          currentPassword: z.string().min(1).max(128),
          newPassword: password,
        }),
      },
    },
    async (r) => {
      await service.changePassword(
        r.user.id,
        r.body.currentPassword,
        r.body.newPassword,
        r.sessionId,
      );
      return { message: "Contraseña actualizada." };
    },
  );
  a.patch(
    "/me/email",
    {
      preHandler: authenticate,
      schema: {
        body: z.object({
          newEmail: email,
          password: z.string().min(1).max(128),
        }),
      },
    },
    async (r) => {
      await service.changeEmail(r.user.id, r.body.newEmail, r.body.password, send);
      return { message: "Revisa tu nuevo email para confirmar el cambio." };
    },
  );
  a.put("/me/avatar", { preHandler: authenticate }, async (r) => ({
    user: await uploadAvatar(r),
  }));
  a.delete("/me/avatar", { preHandler: authenticate }, async (r) => {
    await deleteAvatar(r.user.id);
    return { message: "Avatar eliminado." };
  });
  a.get(
    "/files/avatars/:name",
    { schema: { params: z.object({ name: z.string().regex(avatarName) }) } },
    async (r, reply) => {
      const file = await getAvatar(r.params.name);
      return reply.type(file.mime).header("Cache-Control", "private, max-age=3600").send(file.data);
    },
  );
}
