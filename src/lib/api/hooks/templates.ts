import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../client";
import { keys } from "../keys";
import type {
  Template,
  TemplateDetail,
  TemplateInput,
  TemplateQuery,
  TemplateStatus,
  PreviewInput,
  PreviewResponse,
  MessageResponse,
} from "../types";
export function useTemplates(query: TemplateQuery = {}) {
  return useQuery({
    queryKey: keys.templates.list({ ...query }),
    queryFn: ({ signal }) =>
      apiFetch<Template[]>("/templates", { query: { ...query }, signal }),
    placeholderData: keepPreviousData,
  });
}
export function useTemplate(id: string) {
  return useQuery({
    queryKey: keys.templates.detail(id),
    queryFn: ({ signal }) =>
      apiFetch<TemplateDetail>("/templates/" + id, { signal }),
    enabled: Boolean(id),
  });
}
export function useCreateTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: TemplateInput) =>
      apiFetch<Template>("/templates", { method: "POST", body }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.templates.all }),
  });
}
export function useUpdateTemplate(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<TemplateInput>) =>
      apiFetch<Template>("/templates/" + id, { method: "PATCH", body }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.templates.all }),
  });
}
export function useDuplicateTemplate(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Template>("/templates/" + id + "/duplicate", { method: "POST" }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: keys.templates.lists }),
  });
}
export function useSetTemplateStatus(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (status: TemplateStatus) =>
      apiFetch<Template>("/templates/" + id + "/status", {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.templates.all }),
  });
}
export function useDeleteTemplate(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<MessageResponse>("/templates/" + id, { method: "DELETE" }),
    onSuccess: () => {
      client.removeQueries({ queryKey: keys.templates.detail(id) });
      return client.invalidateQueries({ queryKey: keys.templates.lists });
    },
  });
}
export function usePreviewTemplate() {
  return useMutation({
    mutationFn: (body: PreviewInput) =>
      apiFetch<PreviewResponse>("/templates/preview", { method: "POST", body }),
  });
}
