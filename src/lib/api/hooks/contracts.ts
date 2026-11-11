import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiDownload, apiFetch } from "../client";
import { fetchAllPages } from "../fetch-all-pages";
import { keys } from "../keys";
import { invalidateContract } from "./cache";
import type {
  Contract,
  ContractDetail,
  ContractQuery,
  ContractCounts,
  ContractInput,
  ContractPatch,
  ContractVersion,
  AuditEntry,
  Approval,
  PageQuery,
  Paginated,
  MessageResponse,
  CancelInput,
  OverrideInput,
} from "../types";
export function useContracts(query: ContractQuery = {}) {
  return useQuery({
    queryKey: keys.contracts.list({ ...query }),
    queryFn: ({ signal }) =>
      apiFetch<Paginated<Contract>>("/contracts", {
        query: { ...query },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}
const SEARCH_MIN_LENGTH = 2;
const SEARCH_RESULT_LIMIT = 6;
/** Quick lookup for the command palette; idle until the text is long enough to be meaningful. */
export function useContractSearch(text: string) {
  const query = { q: text, pageSize: SEARCH_RESULT_LIMIT, sort: "-updatedAt" };
  return useQuery({
    queryKey: keys.contracts.list(query),
    queryFn: ({ signal }) =>
      apiFetch<Paginated<Contract>>("/contracts", { query, signal }),
    enabled: text.length >= SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
export function useContract(id: string) {
  return useQuery({
    queryKey: keys.contracts.detail(id),
    queryFn: ({ signal }) =>
      apiFetch<ContractDetail>("/contracts/" + id, { signal }),
    enabled: Boolean(id),
  });
}
export function useContractCounts(archived = false) {
  return useQuery({
    queryKey: keys.contracts.count(archived),
    queryFn: ({ signal }) =>
      apiFetch<ContractCounts>("/contracts/counts", {
        query: { archived },
        signal,
      }),
  });
}
export function useContractVersions(id: string) {
  return useQuery({
    queryKey: keys.contracts.versions(id),
    queryFn: ({ signal }) =>
      fetchAllPages<ContractVersion>("/contracts/" + id + "/versions", { signal }),
    enabled: Boolean(id),
  });
}
export function useContractVersion(id: string, version: number) {
  return useQuery({
    queryKey: keys.contracts.version(id, version),
    queryFn: ({ signal }) =>
      apiFetch<ContractVersion>("/contracts/" + id + "/versions/" + version, {
        signal,
      }),
    enabled: Boolean(id) && version > 0,
  });
}
export function useContractAudit(id: string, query: PageQuery = {}) {
  return useQuery({
    queryKey: keys.contracts.audit(id, { ...query }),
    queryFn: ({ signal }) =>
      apiFetch<Paginated<AuditEntry>>("/contracts/" + id + "/audit", {
        query: { ...query },
        signal,
      }),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}
export function useContractApprovals(id: string) {
  return useQuery({
    queryKey: keys.contracts.approvals(id),
    queryFn: ({ signal }) =>
      fetchAllPages<Approval>("/contracts/" + id + "/approvals", { signal }),
    enabled: Boolean(id),
  });
}
export function useCreateContract() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ContractInput) =>
      apiFetch<ContractDetail>("/contracts", { method: "POST", body }),
    onSuccess: async (contract) => {
      await invalidateContract(client);
      await client.invalidateQueries({ queryKey: keys.templates.lists });
      client.setQueryData(keys.contracts.detail(contract.id), contract);
    },
  });
}
export function useUpdateContract(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ContractPatch) =>
      apiFetch<ContractDetail>("/contracts/" + id, { method: "PATCH", body }),
    onSuccess: () => invalidateContract(client, id),
  });
}
export function useDeleteContract(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (confirm?: string) =>
      apiFetch<MessageResponse>("/contracts/" + id, {
        method: "DELETE",
        body: confirm ? { confirm } : undefined,
      }),
    onSuccess: async () => {
      client.removeQueries({ queryKey: keys.contracts.detail(id) });
      client.removeQueries({ queryKey: keys.contracts.history(id) });
      await invalidateContract(client);
      await client.invalidateQueries({ queryKey: keys.templates.lists });
    },
  });
}
function useContractAction<T>(id: string, action: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: T) =>
      apiFetch<ContractDetail>("/contracts/" + id + "/" + action, {
        method: "POST",
        body,
      }),
    // The response is already the updated contract: show it at once, so the success message does not
    // wait for every list, count and dashboard to refetch; those refresh behind it.
    onSuccess: (updated) => {
      client.setQueryData<ContractDetail>(keys.contracts.detail(id), (previous) => ({
        ...updated,
        signatureSlot: updated.signatureSlot ?? previous?.signatureSlot ?? null,
      }));
      void invalidateContract(client, id);
    },
  });
}
export function useSubmitContract(id: string) {
  return useContractAction<void>(id, "submit");
}
export function useApproveContract(id: string) {
  return useContractAction<{ comment?: string } | void>(id, "approve");
}
export function useRejectContract(id: string) {
  return useContractAction<{ comment: string }>(id, "reject");
}
export function useCancelContract(id: string) {
  return useContractAction<CancelInput>(id, "cancel");
}
export function useUncancelContract(id: string) {
  return useContractAction<void>(id, "uncancel");
}
export function useArchiveContract(id: string) {
  return useContractAction<void>(id, "archive");
}
export function useUnarchiveContract(id: string) {
  return useContractAction<void>(id, "unarchive");
}
export function useOverrideContractStatus(id: string) {
  return useContractAction<OverrideInput>(id, "override-status");
}
export function useRemindSignatory(id: string) {
  return useContractAction<{ signatoryId: string }>(id, "remind");
}
/** T17: creates the amendment (a new linked draft) of a signed contract; returns its id and code. */
export function useCreateAmendment(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      apiFetch<{ id: string; code: string; status: "draft"; amendsContractId: string; amendmentNumber: number }>(
        "/contracts/" + id + "/amendments",
        { method: "POST", body: { reason } },
      ),
    onSuccess: () => invalidateContract(client, id),
  });
}
/** T17: voids one person's signature before activation so they sign again. */
export function useResetSignature(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ signatoryId, reason }: { signatoryId: string; reason: string }) =>
      apiFetch<MessageResponse>("/contracts/" + id + "/signatures/" + signatoryId + "/reset", {
        method: "POST",
        body: { reason },
      }),
    onSuccess: () => invalidateContract(client, id),
  });
}
/** T17: voids every signature before activation; everyone signs again in order. */
export function useResetSignatures(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      apiFetch<MessageResponse>("/contracts/" + id + "/signatures/reset", { method: "POST", body: { reason } }),
    onSuccess: () => invalidateContract(client, id),
  });
}
export function downloadContractPdf(id: string, final = false) {
  return apiDownload("/contracts/" + id + "/pdf", { final });
}
