import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { Card, CardHeader, EmptyState } from '../../ui';
import type { DashboardExpiration } from '../../lib/api/dashboard-types';
import { daysUntil, formatDate, formatMoney } from '../../lib/format';
import { daysLabel } from '../contracts/components/ContractBits';

const URGENT_DAYS = 15;

function ExpirationRow({ contract }: { contract: DashboardExpiration }) {
  const days = Math.max(0, daysUntil(contract.endDate));
  const urgent = days <= URGENT_DAYS;

  return (
    <li>
      <Link to={`/app/contratos/${contract.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-slate-900">{contract.title}</span>
          <span className="block truncate text-xs text-slate-500">
            {formatDate(contract.endDate)}
            {contract.value ? ` · ${formatMoney(contract.value)}` : ''}
          </span>
        </span>
        <span className={urgent ? 'shrink-0 text-sm font-semibold text-red-600' : 'shrink-0 text-sm font-semibold text-amber-700'}>{daysLabel(days)}</span>
      </Link>
    </li>
  );
}

interface ExpirationsCardProps {
  items: DashboardExpiration[];
  title?: string;
  emptyDescription?: string;
}

/** Contracts that end soonest. Shared by the admin and gestor panels. */
export function ExpirationsCard({ items, title = 'Próximos vencimientos', emptyDescription = 'Ningún contrato vence en los próximos 30 días.' }: ExpirationsCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} action={<Link to="/app/contratos?estado=expiring_soon" className="text-[13px] font-medium text-vino-600">Ver todos</Link>} />
      {items.length === 0 ? (
        <EmptyState icon={<CalendarClock />} title="Sin vencimientos próximos" description={emptyDescription} />
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
          {items.map((contract) => (
            <ExpirationRow key={contract.id} contract={contract} />
          ))}
        </ul>
      )}
    </Card>
  );
}
