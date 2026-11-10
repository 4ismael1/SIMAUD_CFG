import { dispatchEmails } from "./email-dispatch.js";
import { updateContractStatus } from "./update-contract-status.js";
import { expiryNotifications } from "./expiry-notifications.js";
import { cleanup } from "./cleanup.js";
import cron from "node-cron";
import { db, pool } from "../db/client.js";
import { jobRuns } from "../db/schema.js";
import { env } from "../config/env.js";
import type { Mailer } from "../lib/mailer.js";
import { auditAdmin, type AuditActor } from "../modules/audit/service.js";

export const jobNames = [
  "contract-status",
  "expiry-notifications",
  "cleanup",
  "email-dispatch",
] as const;
export type JobName = (typeof jobNames)[number];

export function santoDomingoDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function runJob(name: JobName, mailer: Mailer, now = new Date(), actor?: AuditActor) {
  const connection = await pool.connect();
  const lock = 30300 + jobNames.indexOf(name);
  let acquired = false;
  let runId: string | undefined;
  try {
    const result = await connection.query<{ locked: boolean }>(
      "select pg_try_advisory_lock($1) locked",
      [lock],
    );
    acquired = result.rows[0]!.locked;
    if (!acquired) return { skipped: true, reason: "locked" };
    runId = await db.transaction(async (tx) => {
      const [run] = await tx.insert(jobRuns).values({ name, startedAt: now }).returning();
      if (actor)
        await auditAdmin(tx, actor, {
          area: "settings",
          action: "job.started",
          targetType: "job",
          targetId: run!.id,
          targetLabel: name,
        });
      return run!.id;
    });
    const today = santoDomingoDate(now);
    const summary =
      name === "contract-status"
        ? await updateContractStatus(today)
        : name === "expiry-notifications"
          ? await expiryNotifications(today)
          : name === "email-dispatch"
            ? await dispatchEmails(mailer, now)
            : await cleanup(today);
    await connection.query("update job_runs set finished_at=now(),ok=true,summary=$1 where id=$2", [
      JSON.stringify(summary),
      runId,
    ]);
    return { skipped: false, summary };
  } catch (error) {
    if (runId)
      await connection.query(
        "update job_runs set finished_at=now(),ok=false,error=$1 where id=$2",
        ["La tarea no pudo completarse; revisar conectividad y esquema.", runId],
      );
    throw new Error("La tarea programada falló.", { cause: error });
  } finally {
    try {
      if (acquired) await connection.query("select pg_advisory_unlock($1)", [lock]);
    } finally {
      connection.release();
    }
  }
}

export function startScheduler(mailer: Mailer, onError: () => void) {
  if (!env.JOBS_ENABLED || env.NODE_ENV === "test") return async () => {};
  const running = new Set<Promise<unknown>>();
  const execute = (name: JobName) => {
    const execution = runJob(name, mailer).catch(onError);
    running.add(execution);
    void execution.finally(() => running.delete(execution));
  };
  const tasks = [
    cron.schedule("* * * * *", () => execute("email-dispatch")),
    cron.schedule("15 0 * * *", () => execute("contract-status"), {
      timezone: "America/Santo_Domingo",
    }),
    cron.schedule("0 8 * * *", () => execute("expiry-notifications"), {
      timezone: "America/Santo_Domingo",
    }),
    cron.schedule("0 3 * * 0", () => execute("cleanup"), { timezone: "America/Santo_Domingo" }),
  ];
  execute("contract-status");
  return async () => {
    for (const task of tasks) await task.destroy();
    await Promise.allSettled(running);
  };
}
