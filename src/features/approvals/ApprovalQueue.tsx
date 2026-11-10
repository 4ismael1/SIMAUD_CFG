import { Clock3, GitCompareArrows, SearchX } from 'lucide-react';
import { Avatar, EmptyState, SearchInput, cn } from '../../ui';
import type { ApprovalQueueItem } from '../../lib/api/contract-types';
import { formatDate, formatMoneyShort } from '../../lib/format';
import { daysLabel } from '../contracts/components/ContractBits';

const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_HOUR = 3_600;
const SLOW_REVIEW_DAYS = 2;

/** "3 días", "5 h" or "menos de 1 h": how long a contract has been waiting for review. */
export function waitingLabel(ageSeconds: number): string {
  const days = Math.floor(ageSeconds / SECONDS_PER_DAY);
  if (days >= 1) return daysLabel(days);
  const hours = Math.floor(ageSeconds / SECONDS_PER_HOUR);
  return hours >= 1 ? `${hours} h` : 'menos de 1 h';
}

export function isWaitingTooLong(item: ApprovalQueueItem): boolean {
  return item.status === 'pending' && item.ageSeconds >= SLOW_REVIEW_DAYS * SECONDS_PER_DAY;
}

/** Names of the parts that changed since the previous version, in the order a reviewer reads them. */
export function changedParts(diff: NonNullable<ApprovalQueueItem['diff']>): string[] {
  const parts: string[] = [];
  if (diff.contentChanged) parts.push('Texto');
  if (diff.variablesChanged) parts.push('Datos');
  if (diff.detailsChanged) parts.push('Condiciones');
  return parts;
}

interface ApprovalQueueProps {
  items: ApprovalQueueItem[];
  selectedId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
}

/** Inbox-style list of the contracts in the current tab. */
export function ApprovalQueue({ items, selectedId, search, onSearchChange, onSelect }: ApprovalQueueProps) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card lg:max-h-[calc(100dvh-12.5rem)]">
      <div className="border-b border-slate-200 p-3">
        <SearchInput value={search} onChange={onSearchChange} placeholder="Filtrar por título, código o gestor" />
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<SearchX />} title="Nada coincide con el filtro" description="Prueba con otro texto o borra el filtro." className="py-10" />
      ) : (
        <ul className="stagger min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto [--stagger-step:30ms]">
          {items.map((item) => (
            <li key={item.id}>
              <QueueRow item={item} selected={item.id === selectedId} onSelect={() => onSelect(item.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueRow({ item, selected, onSelect }: { item: ApprovalQueueItem; selected: boolean; onSelect: () => void }) {
  const requesterName = item.requester?.name ?? 'Sistema';
  const slow = isWaitingTooLong(item);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'relative flex w-full gap-3 px-4 py-3.5 text-left transition-colors duration-150',
        selected ? 'bg-vino-50/60' : 'hover:bg-slate-50',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full bg-vino-600 transition-opacity duration-150',
          selected ? 'opacity-100' : 'opacity-0',
        )}
      />
      <Avatar name={requesterName} tone="muted" className="mt-0.5" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start justify-between gap-3">
          <span className="truncate text-sm font-semibold text-slate-900">{item.contract.title}</span>
          <QueueTime item={item} slow={slow} />
        </span>
        <span className="truncate text-xs text-slate-500">
          <span className="font-mono">{item.contract.code}</span> · {requesterName}
          {item.contract.contractValue && <> · {formatMoneyShort(item.contract.contractValue)}</>}
        </span>
        <QueueChips item={item} />
      </span>
    </button>
  );
}

function QueueTime({ item, slow }: { item: ApprovalQueueItem; slow: boolean }) {
  if (item.status !== 'pending') {
    return <span className="shrink-0 text-xs text-slate-400">{formatDate(item.reviewedAt ?? item.requestedAt)}</span>;
  }
  return (
    <span className={cn('tabular inline-flex shrink-0 items-center gap-1 text-xs font-medium', slow ? 'text-amber-700' : 'text-slate-400')}>
      <Clock3 className="size-3.5" aria-hidden="true" />
      {waitingLabel(item.ageSeconds)}
      <span className="sr-only"> en espera</span>
    </span>
  );
}

function QueueChips({ item }: { item: ApprovalQueueItem }) {
  if (!item.diff) {
    return <span className="text-xs text-slate-400">Primera revisión · versión {item.versionNumber}</span>;
  }
  const parts = changedParts(item.diff);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
      <GitCompareArrows className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">
        Reenvío v{item.versionNumber} · {parts.length > 0 ? `cambió ${parts.join(', ').toLowerCase()}` : 'sin cambios'}
      </span>
    </span>
  );
}
