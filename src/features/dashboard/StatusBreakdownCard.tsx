import { Card, CardHeader, DonutChart, EmptyState, type DonutSlice } from '../../ui';
import type { ContractStatus } from '../../lib/api/types';
import { contractStatus } from '../../lib/api/status';
import { CONTRACT_STATUS_COLORS } from '../../lib/api/status-colors';

const STATUS_ORDER: ContractStatus[] = ['active', 'expiring_soon', 'pending_signatures', 'pending_approval', 'draft', 'rejected', 'renewed', 'expired', 'cancelled'];

interface StatusBreakdownCardProps {
  title: string;
  counts: Partial<Record<ContractStatus, number>>;
}

/** Donut of contracts by status with its legend. The colour follows the status, never its rank. */
export function StatusBreakdownCard({ title, counts }: StatusBreakdownCardProps) {
  const slices: DonutSlice[] = STATUS_ORDER.map((status) => ({
    label: contractStatus[status].label,
    value: counts[status] ?? 0,
    color: CONTRACT_STATUS_COLORS[status],
  })).filter((slice) => slice.value > 0);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <Card>
      <CardHeader title={title} action={<span className="text-xs text-slate-500">{total} en total</span>} />
      {total === 0 ? (
        <EmptyState title="Sin contratos todavía" />
      ) : (
        <div className="flex flex-col gap-4 p-5">
          <DonutChart slices={slices} centerValue={String(counts.active ?? 0)} centerLabel="vigentes" ariaLabel={slices.map((slice) => `${slice.label}: ${slice.value}`).join(', ')} />
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            {slices.map((slice) => (
              <li key={slice.label} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: slice.color }} aria-hidden="true" />
                  <span className="truncate text-slate-700">{slice.label}</span>
                </span>
                <b className="tabular font-semibold text-slate-900">{slice.value}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
