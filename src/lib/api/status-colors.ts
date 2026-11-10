import type { ContractStatus } from './core-types';

/** Chart color of each contract status, in the order charts list them. */
export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  active: '#15803d',
  renewed: '#8b2029',
  draft: '#cbd5e1',
  pending_signatures: '#1d4ed8',
  expiring_soon: '#d97706',
  pending_approval: '#fbbf24',
  rejected: '#f87171',
  expired: '#7f1d1d',
  cancelled: '#64748b',
  amended: '#a855f7',
};
