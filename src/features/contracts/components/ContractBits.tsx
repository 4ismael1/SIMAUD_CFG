import { Badge } from '../../../ui';
import { contractStatus } from '../../../lib/api/status';
import type { ContractStatus } from '../../../lib/api/types';
import { formatDate } from '../../../lib/format';

export function StatusBadge({ status }: { status: ContractStatus }) {
  const presentation = contractStatus[status];
  return (
    <Badge
      tone={presentation.tone}
      outlined={status === 'expiring_soon' || status === 'expired'}
      strike={status === 'cancelled'}
    >
      {presentation.label}
    </Badge>
  );
}

export function SignatureProgress({ signed, total }: { signed: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((signed / total) * 100);
  return (
    <span className="tabular inline-flex items-center gap-2 text-[13px] text-slate-500">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <span className="block h-full rounded-full bg-green-600" style={{ width: `${percent}%` }} />
      </span>
      <span>
        {signed}/{total}
        <span className="sr-only"> firmas</span>
      </span>
    </span>
  );
}

const EXPIRY_URGENT_DAYS = 15;
const EXPIRY_WARNING_DAYS = 30;

/** End date plus a colored "in N days" hint when the contract is close to expiring. */
export function ExpiryCell({ endDate, daysToExpiry }: { endDate: string | null; daysToExpiry: number | null }) {
  if (!endDate) return <span className="text-slate-400">—</span>;
  return (
    <span className="flex flex-col">
      <span className="whitespace-nowrap">{formatDate(endDate)}</span>
      {daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= EXPIRY_WARNING_DAYS && (
        <span className={daysToExpiry <= EXPIRY_URGENT_DAYS ? 'text-xs font-medium text-red-600' : 'text-xs font-medium text-amber-700'}>
          {daysToExpiry === 0 ? 'vence hoy' : `en ${daysToExpiry} ${daysToExpiry === 1 ? 'día' : 'días'}`}
        </span>
      )}
    </span>
  );
}

export function daysLabel(days: number): string {
  return `${days} ${days === 1 ? 'día' : 'días'}`;
}
