import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api/client';
import { keys } from '../../lib/api/keys';
import { useAuth } from '../../lib/auth';
import type { ApprovalQueueItem, Paginated, SignatureInboxItem } from '../../lib/api/types';
import type { Renewal } from '../../lib/api/lifecycle-types';
import type { NavCounts } from './Sidebar';

const COUNT_STALE_MS = 60_000;

/** Badge counters for the sidebar. Each request only runs for roles allowed to make it. */
export function useNavCounts(): NavCounts {
  const { hasRole } = useAuth();
  const canApprove = hasRole('admin', 'supervisor');
  const canRenew = hasRole('admin', 'supervisor', 'gestor');

  const signatures = useQuery({
    queryKey: keys.signatures.list('pending'),
    queryFn: ({ signal }) => apiFetch<SignatureInboxItem[]>('/me/signatures', { query: { status: 'pending' }, signal }),
    staleTime: COUNT_STALE_MS,
  });

  const approvals = useQuery({
    queryKey: keys.approvals.list('pending'),
    queryFn: ({ signal }) => apiFetch<ApprovalQueueItem[]>('/approvals', { query: { status: 'pending' }, signal }),
    enabled: canApprove,
    staleTime: COUNT_STALE_MS,
  });

  const urgentRenewals = useQuery({
    queryKey: keys.renewals.list({ status: 'pending', priority: 'urgent', pageSize: 1 }),
    queryFn: ({ signal }) =>
      apiFetch<Paginated<Renewal>>('/renewals', { query: { status: 'pending', priority: 'urgent', pageSize: 1 }, signal }),
    enabled: canRenew,
    staleTime: COUNT_STALE_MS,
  });

  return {
    pendingSignatures: signatures.data?.filter((item) => item.myTurn).length,
    pendingApprovals: canApprove ? approvals.data?.length : undefined,
    urgentRenewals: canRenew ? urgentRenewals.data?.meta.total : undefined,
  };
}
