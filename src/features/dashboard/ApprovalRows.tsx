import { Link } from 'react-router-dom';
import type { DashboardApproval } from '../../lib/api/dashboard-types';
import { ButtonLink } from '../../ui';
import { daysLabel } from '../contracts/components/ContractBits';
import { toNumber } from './metrics';

const STALE_APPROVAL_DAYS = 2;

/** Pending approvals as they come from GET /dashboard, oldest first. */
export function ApprovalRows({ items, withReviewButton = false }: { items: DashboardApproval[]; withReviewButton?: boolean }) {
  return (
    <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
      {items.map((item) => {
        const days = Math.floor(toNumber(item.ageDays));
        return (
          <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <Link to={`/app/contratos/${item.contractId}`} className="min-w-0 flex-1 hover:underline">
              <span className="block font-semibold">{item.title}</span>
              <span className="block font-mono text-xs text-slate-500">{item.code}</span>
            </Link>
            <span className={days >= STALE_APPROVAL_DAYS ? 'text-sm font-semibold text-red-600' : 'text-sm text-slate-500'}>
              {days === 0 ? 'hoy' : `esperando ${daysLabel(days)}`}
            </span>
            {withReviewButton && (
              <ButtonLink to={`/app/aprobaciones?contrato=${item.contractId}`} variant="primary" size="sm">
                Revisar
              </ButtonLink>
            )}
          </li>
        );
      })}
    </ul>
  );
}
