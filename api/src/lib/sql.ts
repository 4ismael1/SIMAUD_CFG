import { sql } from "drizzle-orm";

export const santoDomingoToday = sql`(now() at time zone 'America/Santo_Domingo')::date`;
