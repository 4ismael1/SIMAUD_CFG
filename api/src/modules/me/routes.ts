import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "../../plugins/auth.js";
import { email, password, profile } from "../users/schemas.js";
import * as service from "./service.js";
import { avatarName, deleteAvatar, getAvatar, uploadAvatar } from "./avatar.js";
import { identityLimit } from "../auth/rate-limit.js";
import { withRequestStorageMutation } from "../../lib/storage.js";
export async function meRoutes(app: FastifyInstance) {
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
    async (r) => ({ user: await service.updateProfile(r.user.id, r.body, r.ip) }),
  );
  a.patch(
    "/me/password",
    {
      preHandler: authenticate,
      schema: {
        body: z
          .object({
            currentPassword: z.string().min(1).max(128),
            newPassword: password,
          })
          .strict(),
      },
    },
    async (r) => {
      const session = await service.changePassword(
        r.user.id,
        r.body.currentPassword,
        r.body.newPassword,
        r.sessionId,
      );
      return { message: "Contraseña actualizada.", ...session };
    },
  );
  a.patch(
    "/me/email",
    {
      preHandler: [
        authenticate,
        identityLimit("change-email-account", 3, (request) => request.user.id),
        identityLimit(
          "mail-destination",
          3,
          (request) => (request.body as { newEmail: string }).newEmail,
        ),
      ],
      schema: {
        body: z
          .object({
            newEmail: email,
            password: z.string().min(1).max(128),
          })
          .strict(),
      },
    },
    async (r) => {
      await service.changeEmail(r.user.id, r.body.newEmail, r.body.password);
      return { message: "Revisa tu nuevo email para confirmar el cambio." };
    },
  );
  a.put("/me/avatar", { preHandler: authenticate }, async (r, reply) => ({
    user: await uploadAvatar(r, reply),
  }));
  a.delete("/me/avatar", { preHandler: authenticate }, async (r, reply) => {
    await withRequestStorageMutation(r, reply, () => deleteAvatar(r.user.id));
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
