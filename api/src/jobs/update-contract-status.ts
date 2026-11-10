import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

import { getSettings } from "../modules/system/settings.js";

export async function updateContractStatus(today: string) {
  const settings = await getSettings();
  return db.transaction(async (tx) => {
    const changed = await tx.execute(sql`
      with candidates as (
        select
          id,
          status
        from contracts
        where status in ('active', 'expiring_soon')
        and end_date is not null
        and (
          end_date < ${today}::date
          or (
            status = 'active'
            and end_date <= ${today}::date + ${settings.expiryWarningDays}::int
          )
        ) for
        update
      ),
      updated as (
        update contracts c
        set status = case
        when c.end_date < ${today}::date
        then 'expired'::contract_status
        else 'expiring_soon'::contract_status
        end,
        updated_at = now()
        from candidates old
        where c.id = old.id
        returning c.id,
        c.status,
        old.status as old_status
      )
      insert into contract_audit_logs(
        contract_id,
        entity_type,
        entity_id,
        action,
        old_values,
        new_values
      )
      select
        id,
        'contract',
        id,
        'system:contract-status',
        jsonb_build_object('status', old_status),
        jsonb_build_object(
          'status',
          status,
          'actor',
          'system',
          'date',
          ${today}::text
        )
      from updated
      returning id
    `);
    return { changed: changed.rowCount };
  });
}
