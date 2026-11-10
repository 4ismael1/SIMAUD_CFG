import { enqueueMail } from "../../lib/mail/outbox.js";
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
  const outbox = await db.execute<{ pending: number; failed: number }>(
    sql`select count(*) filter (where status = 'pending')::int pending, count(*) filter (where status = 'failed')::int failed from email_outbox`,
  );
  return jobNames.map((name) => ({
    name,
    ...(name === "email-dispatch" ? { outbox: outbox.rows[0] } : {}),
    lastRun: result.rows.find((row) => row.name === name) ?? null,
  }));
}

export async function queueTestMail(to: string) {
  return db.transaction((tx) => enqueueMail(tx, to, "Correo de prueba de SIMAUD", "test"));
}
