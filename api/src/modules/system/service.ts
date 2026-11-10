import { sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { jobNames } from "../../jobs/index.js";

export async function getJobRuns() {
  const result = await db.execute(
    sql`
      select
        distinct on (name) id,
        name,
        started_at as "startedAt",
        finished_at as "finishedAt",
        ok,
        summary,
        error
      from job_runs
      order by name,
      started_at desc,
      id desc
    `,
  );
  return jobNames.map((name) => ({
    name,
    lastRun: result.rows.find((row) => row.name === name) ?? null,
  }));
}
