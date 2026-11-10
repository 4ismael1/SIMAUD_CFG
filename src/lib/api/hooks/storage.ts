import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { keys } from '../keys';
import { invalidateKeys } from './cache';
import type { StorageInput, StorageSettings, StorageTestResult } from '../types';

const MIGRATION_POLL_MS = 4000;

/** Where signatures and documents are stored. Polls while a migration is running. */
export function useStorageSettings() {
  return useQuery({
    queryKey: keys.storage,
    queryFn: ({ signal }) => apiFetch<StorageSettings>('/system/storage', { signal }),
    refetchInterval: (query) => (query.state.data?.migrating ? MIGRATION_POLL_MS : false),
  });
}

/** Writes, reads and deletes a temporary object in the given location without saving anything. */
export function useTestStorage() {
  return useMutation({
    mutationFn: (body: StorageInput) => apiFetch<StorageTestResult>('/system/storage/test', { method: 'POST', body }),
  });
}

/** Saves the location. The API tests it first and keeps it as pending when existing files must be moved. */
export function useUpdateStorage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: StorageInput) => apiFetch<StorageSettings>('/system/storage', { method: 'PUT', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.storage }),
  });
}

/** Starts copying every file to the pending location; it runs in the background. */
export function useMigrateStorage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ jobId: string }>('/system/storage/migrate', { method: 'POST' }),
    onSuccess: () => invalidateKeys(client, [keys.storage, keys.jobs]),
  });
}
