import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../client";
import { fetchAllPages } from "../fetch-all-pages";
import { keys } from "../keys";
import { invalidateContract } from "./cache";
import type {
  Renewal,
  RenewalInput,
  RenewalQuery,
  ContractListSummary,
  RenewalListItem,
  Paginated,
} from "../types";
export function useRenewals(query: RenewalQuery = {}) {
  return useQuery({
    queryKey: keys.renewals.list({ ...query }),
    queryFn: ({ signal }) =>
      apiFetch<Paginated<RenewalListItem>>("/renewals", {
        query: { ...query },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}
export function useEligibleRenewals() {
  return useQuery({
    queryKey: keys.renewals.eligible,
    queryFn: ({ signal }) =>
      fetchAllPages<ContractListSummary>("/renewals/eligible", { signal }),
  });
}
export function useCreateRenewal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RenewalInput) =>
      apiFetch<Renewal>("/renewals", { method: "POST", body }),
    onSuccess: (_response, input) =>
      invalidateContract(client, input.contractId),
  });
}
function useRenewalAction<T>(id: string, action: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: T) =>
      apiFetch<Renewal>("/renewals/" + id + "/" + action, {
        method: "POST",
        body,
      }),
    onSuccess: (response) =>
      invalidateContract(client, response.originalContractId),
  });
}
export function useApproveRenewal(id: string) {
  return useRenewalAction<{ response?: string } | void>(id, "approve");
}
export function useRejectRenewal(id: string) {
  return useRenewalAction<{ response: string }>(id, "reject");
}
export function useCancelRenewal(id: string) {
  return useRenewalAction<void>(id, "cancel");
}
