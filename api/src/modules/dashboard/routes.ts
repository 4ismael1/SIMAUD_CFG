import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../plugins/auth.js";
import { parse } from "../contracts/schemas.js";
import { adminDashboard, supervisorDashboard, gestorDashboard, userDashboard } from "./service.js";

export { adminDashboard } from "./service.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard", { preHandler: authenticate }, async (req) => {
    const { months } = parse(
      z
        .object({
          months: z.coerce
            .number()
            .refine((value) => value === 6 || value === 12)
            .default(6),
        })
        .strict(),
      req.query,
    );
    if (req.user.role === "admin") return adminDashboard(req.user, months);
    if (req.user.role === "supervisor") return supervisorDashboard(req.user);
    if (req.user.role === "gestor") return gestorDashboard(req.user);
    return userDashboard(req.user);
  });
}
