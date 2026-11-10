import { and, sql, type SQL } from "drizzle-orm";

export const santoDomingoToday = sql`(now() at time zone 'America/Santo_Domingo')::date`;

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function localDateRange(column: SQL, from?: string, to?: string): SQL {
  return (
    and(
      from
        ? sql`${column} >= ${from}::date::timestamp at time zone 'America/Santo_Domingo'`
        : undefined,
      to
        ? sql`${column} < (${to}::date + 1)::timestamp at time zone 'America/Santo_Domingo'`
        : undefined,
    ) ?? sql`true`
  );
}
