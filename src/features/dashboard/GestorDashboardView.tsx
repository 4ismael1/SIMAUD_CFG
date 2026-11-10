import { Link } from 'react-router-dom';
import { CircleCheck, FilePlus2, FileText, PenLine, Wallet } from 'lucide-react';
import { ButtonLink, Card, CardHeader, ChartLegend, ColumnChart, EmptyState, Kpi } from '../../ui';
import type { ContractStatus } from '../../lib/api/types';
import type { GestorDashboard } from '../../lib/api/dashboard-types';
import { formatMoney, formatMoneyShort, formatRelative } from '../../lib/format';
import { StatusBadge } from '../contracts/components/ContractBits';
import { ExpirationsCard } from './ExpirationsCard';
import { GestorLanes } from './GestorLanes';
import { StatusBreakdownCard } from './StatusBreakdownCard';
import { formatDecimal, formatPercent, monthLabel } from './metrics';

const CREATED_COLOR = '#8b2029';
const SIGNED_COLOR = '#475569';

function MonthlyCard({ monthly }: { monthly: NonNullable<GestorDashboard['monthly']> }) {
  const labels = monthly.map((point) => monthLabel(point.month));
  const summary = monthly.map((point) => `${monthLabel(point.month)}: ${point.created} creados, ${point.signed} firmados`).join('; ');

  return (
    <Card>
      <CardHeader
        title="Mi actividad"
        description="Contratos creados y firmados, últimos 12 meses"
        action={<ChartLegend items={[{ label: 'Creados', color: CREATED_COLOR }, { label: 'Firmados', color: SIGNED_COLOR }]} />}
      />
      <div className="px-3 pb-3">
        <ColumnChart
          labels={labels}
          ariaLabel={summary}
          formatValue={(value) => formatDecimal(value, 0)}
          series={[
            { label: 'Creados', color: CREATED_COLOR, values: monthly.map((point) => point.created) },
            { label: 'Firmados', color: SIGNED_COLOR, values: monthly.map((point) => point.signed) },
          ]}
        />
      </div>
    </Card>
  );
}

function RecentCard({ recent }: { recent: GestorDashboard['recent'] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Mis contratos recientes" action={<Link to="/app/contratos" className="text-[13px] font-medium text-vino-600">Ver todos</Link>} />
      {recent.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Aún no has creado contratos"
          description="Parte de una plantilla oficial y envíalo a aprobación."
          action={<ButtonLink to="/app/contratos/nuevo" variant="primary" size="sm" icon={<FilePlus2 />}>Nuevo contrato</ButtonLink>}
        />
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          {recent.map((contract) => (
            <li key={contract.id}>
              <Link to={`/app/contratos/${contract.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-slate-900">{contract.title}</span>
                  <span className="block font-mono text-xs text-slate-500">{contract.code} · {formatRelative(contract.updatedAt)}</span>
                </span>
                <StatusBadge status={contract.status} />
                <span className="tabular w-32 text-right text-sm text-slate-700 max-sm:hidden">{contract.value ? formatMoney(contract.value) : '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function statusCounts(rows: NonNullable<GestorDashboard['byStatus']>): Partial<Record<ContractStatus, number>> {
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}

export function GestorDashboardView({ data }: { data: GestorDashboard }) {
  const { kpis } = data;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Mis contratos vigentes" icon={<FileText />} value={formatDecimal(kpis.myActive, 0)} />
        <Kpi label="Valor gestionado" icon={<Wallet />} value={formatMoneyShort(kpis.myValue)} />
        <Kpi
          label="Aprobados a la primera"
          icon={<CircleCheck />}
          value={formatPercent(kpis.firstTimeApprovalRate)}
          footer={<span>Media institucional: {formatPercent(kpis.institutionFirstTimeApprovalRate)}</span>}
        />
        <Kpi label="Firmas pendientes" icon={<PenLine />} value={formatDecimal(kpis.pendingSignatures, 0)} />
      </div>

      <GestorLanes lanes={data.lanes} />

      {(data.monthly || data.byStatus) && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {data.monthly && <MonthlyCard monthly={data.monthly} />}
          {data.byStatus && <StatusBreakdownCard title="Mis contratos por estado" counts={statusCounts(data.byStatus)} />}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <RecentCard recent={data.recent} />
        {data.upcomingExpirations && <ExpirationsCard items={data.upcomingExpirations} title="Mis próximos vencimientos" emptyDescription="Ninguno de tus contratos vigentes está por vencer." />}
      </div>
    </>
  );
}
