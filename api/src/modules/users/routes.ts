import { zCedula } from "../../lib/validation/zod.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { ApiError } from "../../lib/errors.js";
import { requireRole } from "../../plugins/auth.js";
import * as schema from "./schemas.js";
import * as service from "./service.js";
export async function userRoutes(app: FastifyInstance) {
  const a = app.withTypeProvider<ZodTypeProvider>();
  const admin = requireRole("admin");
  a.get(
    "/lookup",
    {
      preHandler: requireRole("admin", "supervisor", "gestor"),
      schema: {
        querystring: z.object({ cedula: zCedula }),
      },
    },
    async (r) => {
      const [user] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          cedula: users.cedula,
        })
        .from(users)
        .where(
          and(eq(users.cedula, r.query.cedula), eq(users.isActive, true), isNull(users.deletedAt)),
        );
      if (!user) throw new ApiError(404, "NOT_FOUND", "No se encontró el usuario.");
      return user;
    },
  );
  a.get("/", { preHandler: admin, schema: { querystring: schema.listQuery } }, async (r) =>
    service.listUsers(r.query),
  );
  a.get("/:id", { preHandler: admin, schema: { params: schema.idParams } }, async (r) =>
    service.findUser(r.params.id),
  );
  a.post("/", { preHandler: admin, schema: { body: schema.createUserBody } }, async (r, reply) => {
    const result = await service.createUser(r.body);
    r.log.info(
      {
        actorId: r.user.id,
        entityId: result.user.id,
        action: "user.created",
      },
      "Auditoría usuarios",
    );
    return reply.code(201).send(result);
  });
  a.patch(
    "/:id",
    {
      preHandler: admin,
      schema: { params: schema.idParams, body: schema.patchUserBody },
    },
    async (r) => {
      const user = await service.changeUser(r.user.id, r.params.id, r.body);
      r.log.info(
        { actorId: r.user.id, entityId: user.id, action: "user.updated" },
        "Auditoría usuarios",
      );
      return { user };
    },
  );
  a.delete("/:id", { preHandler: admin, schema: { params: schema.idParams } }, async (r) => {
    await service.changeUser(r.user.id, r.params.id, {}, true);
    r.log.info(
      { actorId: r.user.id, entityId: r.params.id, action: "user.deleted" },
      "Auditoría usuarios",
    );
    return { message: "Usuario eliminado." };
  });
}
