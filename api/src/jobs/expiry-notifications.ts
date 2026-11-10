import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { expiryDeliveries } from "../db/schema.js";
import { getSettings } from "../modules/system/settings.js";
import { addNotification } from "../modules/notifications/service.js";

export async function expiryNotifications(today: string) {
  const settings = await getSettings();
  return db.transaction(async (tx) => {
    const recipients = await tx.execute<{
      contract_id: string;
      user_id: string;
      threshold: number;
      title: string;
    }>(sql`
      select
        distinct c.id contract_id,
        u.id user_id,
        (c.end_date - ${today}::date)::int threshold,
        c.title
      from contracts c
      join users u on u.is_active
      and u.deleted_at is null
      and (
        u.id = c.created_by
        or exists (
          select 1
          from contract_signatories s
          where s.contract_id = c.id
          and s.user_id = u.id
        )
        or (
          c.end_date - ${today}::date <= 7
          and u.role in ('admin', 'supervisor')
        )
      )
      where c.status in ('active', 'expiring_soon')
      and c.end_date - ${today}::date = any (${"{" + settings.expiryNotificationDays.join(",") + "}"}::int[])
    `);
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
      }
    }
    return { sent };
  });
}
