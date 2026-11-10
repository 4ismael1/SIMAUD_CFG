import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../client";
import { keys } from "../keys";
import type { Dashboard } from "../types";
export function useDashboard(months = 6) {
  return useQuery({
    queryKey: keys.dashboard.detail(months),
    queryFn: ({ signal }) =>
      apiFetch<Dashboard>("/dashboard", { query: { months }, signal }),
  });
}
