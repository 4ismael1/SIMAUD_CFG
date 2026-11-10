import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiDownload, apiFetch } from "../client";
import { keys } from "../keys";
import type { Report, ReportQuery, ReportType } from "../types";
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
