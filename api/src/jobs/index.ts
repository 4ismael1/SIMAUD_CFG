import cron from "node-cron";
import { sql } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { jobRuns, expiryDeliveries } from "../db/schema.js";
import { getSettings } from "../modules/system/settings.js";
import { addNotification } from "../modules/notifications/service.js";
import { env } from "../config/env.js";
import type { Mailer, Mail } from "../lib/mailer.js";
export const jobNames = ["contract-status", "expiry-notifications", "cleanup"] as const;
export type JobName = (typeof jobNames)[number];
export function santoDomingoDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
async function updateContractStatus(today: string) {
  const settings = await getSettings();
  return db.transaction(async (tx) => {
    const changed = await tx.execute(sql`with candidates as (
      select id,status from contracts where status in ('active','expiring_soon') and end_date is not null
      and (end_date < ${today}::date or (status='active' and end_date <= ${today}::date + ${settings.expiryWarningDays}::int)) for update
    ), updated as (
      update contracts c set status=case when c.end_date < ${today}::date then 'expired'::contract_status else 'expiring_soon'::contract_status end,updated_at=now()
      from candidates old where c.id=old.id returning c.id,c.status,old.status as old_status
    ) insert into contract_audit_logs(contract_id,entity_type,entity_id,action,old_values,new_values)
      select id,'contract',id,'system:contract-status',jsonb_build_object('status',old_status),jsonb_build_object('status',status,'actor','system','date',${today}::text) from updated returning id`);
    return { changed: changed.rowCount };
  });
}
async function expiryNotifications(today: string, mailer: Mailer) {
  const settings = await getSettings();
  const mails: Mail[] = [];
  const summary = await db.transaction(async (tx) => {
    const recipients = await tx.execute<{
      contract_id: string;
      user_id: string;
      threshold: number;
      title: string;
      email: string;
      email_enabled: boolean;
    }>(sql`
      select distinct c.id contract_id,u.id user_id,(c.end_date-${today}::date)::int threshold,c.title,u.email,
      coalesce((u.notification_preferences->>'emailOnExpiry')::boolean,true) email_enabled
      from contracts c join users u on u.is_active and u.deleted_at is null and
      (u.id=c.created_by or exists(select 1 from contract_signatories s where s.contract_id=c.id and s.user_id=u.id) or (c.end_date-${today}::date<=7 and u.role in ('admin','supervisor')))
      where c.status in ('active','expiring_soon') and c.end_date-${today}::date = any(${"{" + settings.expiryNotificationDays.join(",") + "}"}::int[])`);
    let sent = 0;
    for (const row of recipients.rows) {
      const [delivery] = await tx
        .insert(expiryDeliveries)
        .values({ contractId: row.contract_id, userId: row.user_id, threshold: row.threshold })
        .onConflictDoNothing()
        .returning();
      if (!delivery) continue;
      const notification = await addNotification(tx, {
        userId: row.user_id,
        type: "contract_expiring",
        title: row.title,
        message: "El contrato vence en " + row.threshold + " días.",
        data: { contractId: row.contract_id, threshold: row.threshold },
        actionUrl: "/contratos/" + row.contract_id,
        expiryContractId: row.contract_id,
        expiryThreshold: row.threshold,
      });
      if (notification) {
        sent++;
        if (row.email_enabled)
          mails.push({
            to: row.email,
            subject: "SIMAUD: vencimiento de contrato",
            text:
              notification.message + " " + env.APP_URL.replace(/\/$/, "") + notification.actionUrl,
          });
      }
    }
    return { sent };
  });
  for (const mail of mails) await mailer(mail);
  return summary;
}
async function cleanup(today: string) {
  return db.transaction(async (tx) => {
    const notifications = await tx.execute(
      sql`delete from notifications where read_at < ${today}::date - interval '90 days' returning id`,
    );
    // The separate delivery ledger survives notification deletion and cleanup.
    const refresh = await tx.execute(
      sql`delete from refresh_tokens where expires_at < ${today}::date - interval '30 days' returning id`,
    );
    const auth = await tx.execute(
      sql`delete from auth_tokens where expires_at < ${today}::date - interval '30 days' returning id`,
    );
    return {
      notifications: notifications.rowCount,
      refreshTokens: refresh.rowCount,
      authTokens: auth.rowCount,
    };
  });
}
export async function runJob(name: JobName, mailer: Mailer, now = new Date()) {
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
    const [run] = await db.insert(jobRuns).values({ name, startedAt: now }).returning();
    runId = run!.id;
    const today = santoDomingoDate(now);
    const summary =
      name === "contract-status"
        ? await updateContractStatus(today)
        : name === "expiry-notifications"
          ? await expiryNotifications(today, mailer)
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
