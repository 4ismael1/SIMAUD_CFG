import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { settings } from "../../db/schema.js";
import { requireRole } from "../../plugins/auth.js";
import { parse } from "../contracts/schemas.js";
import { getSettings, settingsSchema } from "./settings.js";
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
    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(patch))
        await tx
          .insert(settings)
          .values({ key, value })
          .onConflictDoUpdate({ target: settings.key, set: { value } });
    });
    return getSettings();
  });
  app.get("/system/jobs", admin, async () => {
    const result = await db.execute(
      sql`select distinct on(name) id,name,started_at as "startedAt",finished_at as "finishedAt",ok,summary,error from job_runs order by name,started_at desc,id desc`,
    );
    return jobNames.map((name) => ({
      name,
      lastRun: result.rows.find((row) => row.name === name) ?? null,
    }));
  });
  app.post("/system/jobs/:name/run", admin, async (req) =>
    runJob(parse(z.enum(jobNames), (req.params as { name: string }).name), mailer),
  );
}
