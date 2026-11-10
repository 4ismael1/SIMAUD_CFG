import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../client";
import { keys } from "../keys";
import { invalidateKeys } from "./cache";
import type { SystemSettings, JobSummary, JobResult, JobName } from "../types";
export function useSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: ({ signal }) =>
      apiFetch<SystemSettings>("/system/settings", { signal }),
  });
}
export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<SystemSettings>) =>
      apiFetch<SystemSettings>("/system/settings", { method: "PATCH", body }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.settings }),
  });
}
export function useJobs() {
  return useQuery({
    queryKey: keys.jobs,
    queryFn: ({ signal }) => apiFetch<JobSummary[]>("/system/jobs", { signal }),
  });
}
export function useRunJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: JobName) =>
      apiFetch<JobResult>("/system/jobs/" + name + "/run", { method: "POST" }),
    onSuccess: () =>
      invalidateKeys(client, [
        keys.jobs,
        keys.contracts.all,
        keys.notifications.all,
        keys.renewals.all,
        keys.dashboard.all,
        keys.reports.all,
      ]),
  });
}
/** Queues a test e-mail through the configured provider (Brevo/SMTP or Resend). */
export function useSendTestMail() {
  return useMutation({
    mutationFn: (to: string) => apiFetch<unknown>("/system/mail/test", { method: "POST", body: { to } }),
  });
}
