import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "../client";
import { keys } from "../keys";
import type { Dashboard } from "../types";
export function useDashboard(months = 6) {
  return useQuery({
    queryKey: keys.dashboard.detail(months),
    queryFn: ({ signal }) =>
      apiFetch<Dashboard>("/dashboard", { query: { months }, signal }),
    // Switching 6/12 months keeps the current panel on screen instead of falling back to the skeleton.
    placeholderData: keepPreviousData,
  });
}
