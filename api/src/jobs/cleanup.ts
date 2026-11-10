import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

export async function cleanup(today: string) {
  return db.transaction(async (tx) => {
    const notifications = await tx.execute(
      sql`
        delete
        from notifications
        where read_at < ${today}::date - interval '90 days'
        returning id
      `,
    );
    // The separate delivery ledger survives notification deletion and cleanup.
    const refresh = await tx.execute(
      sql`
        delete
        from refresh_tokens
        where expires_at < ${today}::date - interval '30 days'
        returning id
      `,
    );
    const auth = await tx.execute(
      sql`
        delete
        from auth_tokens
        where expires_at < ${today}::date - interval '30 days'
        returning id
      `,
    );
    return {
      notifications: notifications.rowCount,
      refreshTokens: refresh.rowCount,
      authTokens: auth.rowCount,
    };
  });
}
