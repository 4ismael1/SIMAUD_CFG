import { getJobRuns } from "./service.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../../plugins/auth.js";
import { parse } from "../contracts/schemas.js";
import { getSettings, updateSettings, settingsSchema } from "./settings.js";
import { jobNames, runJob } from "../../jobs/index.js";
import type { Mailer } from "../../lib/mailer.js";

export async function systemRoutes(app: FastifyInstance, mailer: Mailer) {
  const admin = { preHandler: requireRole("admin") };
  app.get("/system/settings", admin, () => getSettings());
  app.patch("/system/settings", admin, async (req) => {
    const patch = parse(
      settingsSchema.partial().refine((value) => Object.keys(value).length > 0),
      req.body,
    );
    return updateSettings(patch);
  });
  app.get("/system/jobs", admin, async () => {
    return getJobRuns();
  });
  app.post("/system/jobs/:name/run", admin, async (req) =>
    runJob(parse(z.enum(jobNames), (req.params as { name: string }).name), mailer),
  );
}
