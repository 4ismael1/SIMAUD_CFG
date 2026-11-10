import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiPostBlob } from "../client";
import { keys } from "../keys";
import type { ContentFormat, DocumentContent } from "../../rich-doc/types";
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

/** The rendered body of a preview, whatever its format. */
export function previewContent(response: PreviewResponse): DocumentContent {
  // Every formatted version (rich-v1, rich-v2…) comes as a document; only plain text comes as html.
  return "document" in response ? response.document : response.html;
}

/**
 * Whether the API stores formatted documents (task T13). Older APIs do not send `contentFormat`
 * in templates; until then the editor saves plain text.
 */
export function useRichDocsSupported(): boolean | undefined {
  const templates = useTemplates();
  if (!templates.data) return undefined;
  return templates.data.some((template) => "contentFormat" in template);
}

export interface TemplateCapabilities {
  formats: ContentFormat[];
}

/**
 * Best format the API can store: `rich-v2` (task T15, announced by /templates/capabilities),
 * `rich-v1` (T13: templates carry `contentFormat`) or `plain`. Undefined while loading.
 */
export function useBestContentFormat(): ContentFormat | undefined {
  const capabilities = useQuery({
    queryKey: ["templates", "capabilities"],
    queryFn: ({ signal }) => apiFetch<TemplateCapabilities>("/templates/capabilities", { signal }),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const richV1 = useRichDocsSupported();
  if (capabilities.data?.formats.includes("rich-v2")) return "rich-v2";
  if (capabilities.isPending) return undefined;
  if (richV1 === undefined) return undefined;
  return richV1 ? "rich-v1" : "plain";
}

/**
 * The real PDF of a template being edited (task T15): same layout, fonts and page breaks as the final
 * contract, with the data shown as [Label]. Only when the API announces `previewPdf`.
 */
export function useTemplatePdfPreview(input: { contentFormat: ContentFormat; content: DocumentContent; title: string } | null) {
  return useQuery({
    queryKey: ["templates", "preview-pdf", input],
    queryFn: ({ signal }) => apiPostBlob("/templates/preview-pdf", input, signal),
    enabled: input !== null,
    retry: false,
    staleTime: 60_000,
  });
}

/** True when the API can render the real PDF preview. */
export function usePdfPreviewSupported(): boolean {
  const capabilities = useQuery({
    queryKey: ["templates", "capabilities"],
    queryFn: ({ signal }) => apiFetch<TemplateCapabilities & { previewPdf?: boolean }>("/templates/capabilities", { signal }),
    retry: false,
    staleTime: 5 * 60_000,
  });
  return Boolean(capabilities.data?.previewPdf);
}
