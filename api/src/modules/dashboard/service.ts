import type { Actor } from "../contracts/service.js";
import { contractScope, approvalQueue } from "./queries.js";
import {
  getAdminAttention,
  getAdminCurrent,
  getAdminHistory,
  getAdminMonthly,
  getAdminStatuses,
  getAdminUpcomingExpirations,
} from "./admin-queries.js";
import {
  getSupervisorKpis,
  getSupervisorTemplateUsage,
  getSupervisorMyRecentDecisions,
} from "./supervisor-queries.js";
import { getGestorKpis, getGestorLanes, getGestorRecent } from "./gestor-queries.js";
import { getUserDashboard } from "./user-queries.js";

export async function adminDashboard(actor: Actor, months: number) {
  const attention = await getAdminAttention();
  const current = await getAdminCurrent();
  const history = await getAdminHistory();
  const kpis = Object.fromEntries(
    Object.entries(current).map(([key, value]) => [
      key,
      {
        value,
        previous: history.at(-1)!.metrics[key],
        trend: [...history.slice(1).map((row) => row.metrics[key]), value],
      },
    ]),
  );
  const monthly = await getAdminMonthly(months);
  const statuses = await getAdminStatuses();
  const upcomingExpirations = await getAdminUpcomingExpirations();
  return {
    attention,
    kpis,
    monthly,
    byStatus: Object.fromEntries(statuses.map((row) => [row.status, row.count])),
    pendingApprovals: await approvalQueue(actor),
    upcomingExpirations,
  };
}

export async function supervisorDashboard(actor: Actor) {
  const kpis = await getSupervisorKpis(actor);
  const templateUsage = await getSupervisorTemplateUsage();
  const myRecentDecisions = await getSupervisorMyRecentDecisions(actor);
  return { kpis, queue: await approvalQueue(actor), templateUsage, myRecentDecisions };
}

export async function gestorDashboard(actor: Actor) {
  const scope = contractScope(actor);
  const kpis = await getGestorKpis(scope);
  const lanes = await getGestorLanes(scope);
  const recent = await getGestorRecent(scope);
  return { kpis, lanes, recent };
}

export async function userDashboard(actor: Actor) {
  return getUserDashboard(actor);
}
