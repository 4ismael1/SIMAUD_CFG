import { useMemo } from 'react';
import { useSignatures } from '../../lib/api/hooks/signatures';
import type { SignatureInboxItem } from '../../lib/api/contract-types';
import type { ContractStatus } from '../../lib/api/core-types';

/**
 * Every contract the signed-in person takes part in as a signatory, from the signature inbox
 * (pending + signed). A signer rarely has more than a few dozen, so one large page of each is enough.
 */

const PAGE_SIZE = 100;

export type MyContractGroup = 'turn' | 'waiting' | 'active' | 'finished';

const ACTIVE: ContractStatus[] = ['active', 'expiring_soon'];
const FINISHED: ContractStatus[] = ['expired', 'cancelled', 'renewed', 'rejected'];

/** Where a contract belongs from the signer's point of view. */
export function groupOf(row: SignatureInboxItem): MyContractGroup {
  if (row.myTurn) return 'turn';
  if (ACTIVE.includes(row.status)) return 'active';
  if (FINISHED.includes(row.status)) return 'finished';
  return 'waiting';
}

export function useMyContracts() {
  const pending = useSignatures('pending', 1, PAGE_SIZE);
  const signed = useSignatures('signed', 1, PAGE_SIZE);

  const rows = useMemo(() => {
    const byId = new Map<string, SignatureInboxItem>();
    for (const row of [...(pending.data?.data ?? []), ...(signed.data?.data ?? [])]) byId.set(row.id, row);
    return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [pending.data, signed.data]);

  const groups = useMemo(() => {
    const out: Record<MyContractGroup, SignatureInboxItem[]> = { turn: [], waiting: [], active: [], finished: [] };
    for (const row of rows) out[groupOf(row)].push(row);
    return out;
  }, [rows]);

  return {
    rows,
    groups,
    isPending: pending.isPending || signed.isPending,
    error: pending.error ?? signed.error,
  };
}
