import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../client';
import type { Paginated } from '../types';

/** Unified audit feed (contracts + administration), task T12b. Admin only, read-only. */

export type AuditArea = 'contracts' | 'users' | 'settings' | 'templates' | 'variables' | 'storage' | 'auth';

export interface AuditEntry {
  id: string;
  source: 'contract' | 'admin';
  at: string;
  area: AuditArea;
  action: string;
  actorId: string | null;
  actorName: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string;
  contractId: string | null;
  contractCode: string | null;
  /** Sentence in Spanish, past tense. */
  summary: string;
}

export interface AuditQuery {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  area?: AuditArea;
  actorId?: string;
  contractId?: string;
  action?: string;
  q?: string;
}

export function useAudit(query: AuditQuery) {
  return useQuery({
    queryKey: ['audit', query],
    queryFn: ({ signal }) => apiFetch<Paginated<AuditEntry>>('/audit', { query: { ...query }, signal }),
    placeholderData: keepPreviousData,
  });
}

/** Stable row key: ids are unique per source only. */
export const auditKey = (entry: AuditEntry) => `${entry.source}:${entry.id}`;
