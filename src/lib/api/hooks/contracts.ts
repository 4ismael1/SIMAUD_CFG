import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiDownload, apiFetch } from "../client";
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
      apiFetch<ContractVersion[]>("/contracts/" + id + "/versions", { signal }),
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
      apiFetch<Approval[]>("/contracts/" + id + "/approvals", { signal }),
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
    onSuccess: () => invalidateContract(client, id),
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
export function downloadContractPdf(id: string, final = false) {
  return apiDownload("/contracts/" + id + "/pdf", { final });
}
