import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { keys } from '../keys';
import { invalidateContract } from './cache';
import type { BulkContractInput, BulkContractResult, ContractDetail, MessageResponse, ReassignInput } from '../types';

interface RowAction {
  id: string;
  action: 'archive' | 'unarchive' | 'cancel' | 'uncancel' | 'override-status';
  body?: unknown;
}

/** Runs a lifecycle action on any contract of a list, where the id is only known at click time. */
export function useContractRowAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: RowAction) => apiFetch<ContractDetail>(`/contracts/${id}/${action}`, { method: 'POST', body }),
    onSuccess: (_contract, { id }) => invalidateContract(client, id),
  });
}

/** Deletes a draft from a list. The API refuses anything that already carries signatures. */
export function useDeleteContractRow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<MessageResponse>(`/contracts/${id}`, { method: 'DELETE' }),
    onSuccess: async (_message, id) => {
      client.removeQueries({ queryKey: keys.contracts.detail(id) });
      await invalidateContract(client);
    },
  });
}

/** Admin only: hands a contract over to another manager, with a reason kept in the audit trail. */
export function useReassignContract() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ReassignInput & { id: string }) => apiFetch<ContractDetail>(`/contracts/${id}/reassign`, { method: 'POST', body }),
    onSuccess: (_contract, { id }) => invalidateContract(client, id),
  });
}

/** Admin only: cancels, archives or unarchives up to 100 contracts; each one succeeds or fails on its own. */
export function useBulkContracts() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkContractInput) => apiFetch<BulkContractResult>('/contracts/bulk', { method: 'POST', body }),
    onSuccess: () => invalidateContract(client),
  });
}
