import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { keys } from "../keys";
export async function invalidateKeys(
  client: QueryClient,
  queryKeys: readonly QueryKey[],
) {
  await Promise.all(
    queryKeys.map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}
export function invalidateContract(client: QueryClient, id?: string) {
  const affected: QueryKey[] = [
    keys.contracts.lists,
    keys.contracts.counts,
    keys.approvals.all,
    keys.signatures.all,
    keys.renewals.all,
    keys.dashboard.all,
    keys.reports.all,
    keys.notifications.all,
  ];
  if (id) affected.push(keys.contracts.detail(id), keys.contracts.history(id));
  return invalidateKeys(client, affected);
}
