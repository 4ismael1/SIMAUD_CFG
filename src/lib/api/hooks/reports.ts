import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiDownload, apiFetch } from "../client";
import { keys } from "../keys";
import type {
  Report,
  ReportFilterOptions,
  ReportQuery,
  ReportsOverview,
  ReportsOverviewQuery,
  ReportType,
} from "../types";
export function useReport(type: ReportType, query: ReportQuery = {}) {
  return useQuery({
    queryKey: keys.reports.detail(type, { ...query }),
    queryFn: ({ signal }) =>
      apiFetch<Report>("/reports/" + type, { query: { ...query }, signal }),
    placeholderData: keepPreviousData,
  });
}
export function downloadReport(
  type: ReportType,
  format: "csv" | "xlsx" | "pdf",
  query: ReportQuery = {},
) {
  return apiDownload("/reports/" + type + "/export", { ...query, format });
}
export function useReportsOverview(
  query: ReportsOverviewQuery,
  enabled = true,
) {
  return useQuery({
    queryKey: keys.reports.detail("overview", { ...query }),
    queryFn: ({ signal }) =>
      apiFetch<ReportsOverview>("/reports/overview", {
        query: { ...query },
        signal,
      }),
    placeholderData: keepPreviousData,
    enabled,
  });
}
export function useReportFilterOptions() {
  return useQuery({
    queryKey: keys.reports.detail("filters", {}),
    queryFn: ({ signal }) =>
      apiFetch<ReportFilterOptions>("/reports/filters", { signal }),
    staleTime: 5 * 60_000,
  });
}
