import { sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { type Actor, forbidden } from "../contracts/service.js";
import type { OverviewQuery } from "./overview-schema.js";
import { overviewRanges, comparedTimeline } from "./overview-periods.js";
import {
  overviewScope,
  overviewMetrics,
  overviewTimeline,
  overviewApprovals,
} from "./overview-queries.js";
import { overviewTables, overviewManagers, overviewUsers } from "./overview-tables.js";

export async function reportsOverview(actor: Actor, query: OverviewQuery, now = new Date()) {
  if (!["admin", "supervisor", "gestor"].includes(actor.role)) throw forbidden();
  const { range, previousRange } = overviewRanges(query, now);
  const scope = overviewScope(actor, query);
  return db.transaction(
    async (tx) => {
      const current = await overviewMetrics(tx, scope, range);
      const previous = await overviewMetrics(tx, scope, previousRange);
      const kpis = Object.fromEntries(
        Object.entries(current).map(([key, value]) => [
          key,
          { value, previous: previous[key as keyof typeof previous] },
        ]),
      );
      const currentTimeline = await overviewTimeline(tx, scope, range, query.granularity);
      const previousTimeline = await overviewTimeline(tx, scope, previousRange, query.granularity);
      const timeline = comparedTimeline(
        range,
        previousRange,
        query.granularity,
        currentTimeline,
        previousTimeline,
      );
      const tables = await overviewTables(tx, scope, range);
      const byManager = await overviewManagers(tx, scope, range);
      const approvals = await overviewApprovals(tx, scope, range);
      const result = { range, previousRange, kpis, timeline, ...tables, byManager, approvals };
      if (actor.role !== "admin") return result;
      return { ...result, users: await overviewUsers(tx, range, previousRange, query.granularity) };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function reportFilters(actor: Actor) {
  if (!["admin", "supervisor", "gestor"].includes(actor.role)) throw forbidden();
  const managers = (
    await db.execute<{ id: string; name: string }>(sql`
    select id, name from users where deleted_at is null
    and (${actor.role} = 'gestor' and id = ${actor.id}::uuid
      or ${actor.role} <> 'gestor' and is_active and role in ('admin', 'gestor'))
    order by name, id
  `)
  ).rows;
  const templates = (
    await db.execute<{ id: string; title: string }>(sql`
    select id, title from contract_templates order by title, id
  `)
  ).rows;
  return { managers, templates };
}

export type ReportsOverview = Awaited<ReturnType<typeof reportsOverview>>;
