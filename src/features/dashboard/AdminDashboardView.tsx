import { Link } from 'react-router-dom';
import { CircleCheck, Clock, FileText, PenLine, TriangleAlert } from 'lucide-react';
import { ButtonLink, Card, CardHeader, Delta, DonutChart, EmptyState, Kpi, LineChart, Sparkline, type DonutSlice } from '../../ui';
import type { AdminDashboard } from '../../lib/api/dashboard-types';
import type { ContractStatus } from '../../lib/api/types';
import { contractStatus } from '../../lib/api/status';
import { formatDate, formatMoney, formatMoneyShort } from '../../lib/format';
import { daysLabel } from '../contracts/components/ContractBits';
import { absoluteChange, formatDecimal, monthLabel, percentChange, toNumber, trendOf, trendValues } from './metrics';

const STATUS_COLORS: Partial<Record<ContractStatus, string>> = {
  active: '#15803d',
  renewed: '#8b2029',
  draft: '#cbd5e1',
  pending_signatures: '#1d4ed8',
  expiring_soon: '#d97706',
  pending_approval: '#fbbf24',
  rejected: '#f87171',
  expired: '#7f1d1d',
  cancelled: '#64748b',
};

export function AdminDashboardView({ data }: { data: AdminDashboard }) {
  const { attention, kpis } = data;
  const slices: DonutSlice[] = (Object.keys(STATUS_COLORS) as ContractStatus[])
    .map((status) => ({ label: contractStatus[status].label, value: data.byStatus[status] ?? 0, color: STATUS_COLORS[status] ?? '#cbd5e1' }))
    .filter((slice) => slice.value > 0);
  const totalContracts = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <>
      <AttentionBanner attention={attention} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricKpi label="Contratos vigentes" icon={<FileText />} value={formatDecimal(kpis.activeContracts.value, 0)} metric={kpis.activeContracts} />
        <MetricKpi label="Valor vigente" icon={<FileText />} value={formatMoneyShort(kpis.activeValue.value)} metric={kpis.activeValue} />
        <Kpi
          label="Firmas pendientes"
          icon={<PenLine />}
          value={formatDecimal(kpis.pendingSignatures.value, 0)}
          footer={<span>en {formatDecimal(kpis.contractsAwaitingSignatures.value, 0)} contratos</span>}
        />
        <MetricKpi
          label="Tiempo medio de aprobación"
          icon={<Clock />}
          value={`${formatDecimal(kpis.avgApprovalDays.value)} días`}
          metric={kpis.avgApprovalDays}
          lowerIsBetter
          changeText={absoluteChange(kpis.avgApprovalDays, ' días')}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Contratos creados y firmados"
            description="Por mes"
            action={
              <div className="flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-vino-600" />Creados</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-slate-700" />Firmados</span>
              </div>
            }
          />
          <div className="px-3 pb-3">
            <LineChart
              labels={data.monthly.map((point) => monthLabel(point.month))}
              ariaLabel={data.monthly.map((point) => `${monthLabel(point.month)}: ${point.created} creados, ${point.signed} firmados`).join('; ')}
              series={[
                { label: 'Creados', color: '#8b2029', values: data.monthly.map((point) => point.created), area: true },
                { label: 'Firmados', color: '#334155', values: data.monthly.map((point) => point.signed), dashed: true },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Contratos por estado" action={<span className="text-xs text-slate-500">{totalContracts} en total</span>} />
          <div className="flex flex-col gap-4 p-5">
            <DonutChart
              slices={slices}
              centerValue={String(data.byStatus.active ?? 0)}
              centerLabel="vigentes"
              ariaLabel={slices.map((slice) => `${slice.label}: ${slice.value}`).join(', ')}
            />
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              {slices.map((slice) => (
                <li key={slice.label} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: slice.color }} />
                    <span className="truncate">{slice.label}</span>
                  </span>
                  <b className="tabular">{slice.value}</b>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Pendientes de aprobación"
            description="Ordenados por antigüedad"
            action={<ButtonLink to="/app/aprobaciones" size="sm">Ver cola</ButtonLink>}
          />
          {data.pendingApprovals.length === 0 ? (
            <EmptyState icon={<CircleCheck />} title="Nada pendiente" description="No hay contratos esperando aprobación." />
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {data.pendingApprovals.map((item) => {
                const days = Math.floor(item.ageSeconds / 86_400);
                return (
                  <li key={item.id}>
                    <Link to={`/app/contratos/${item.contract.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{item.contract.title}</span>
                        <span className="block font-mono text-xs text-slate-500">{item.contract.code} · {item.requester?.name ?? '—'}</span>
                      </span>
                      <span className={days >= 2 ? 'text-sm font-semibold text-red-600' : 'text-sm text-slate-500'}>
                        {days === 0 ? 'hoy' : daysLabel(days)}
                      </span>
                      <span className="tabular w-36 text-right text-sm">{item.contract.contractValue ? formatMoney(item.contract.contractValue) : '—'}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Próximos vencimientos" action={<Link to="/app/contratos?estado=expiring_soon" className="text-[13px] font-medium text-vino-600">Ver todos</Link>} />
          {data.upcomingExpirations.length === 0 ? (
            <EmptyState title="Sin vencimientos próximos" description="Ningún contrato vence en los próximos 30 días." />
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 px-5 pb-2">
              {data.upcomingExpirations.map((contract) => (
                <li key={contract.id}>
                  <Link to={`/app/contratos/${contract.id}`} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{contract.title}</span>
                      <span className="block text-xs text-slate-500">{contract.endDate ? formatDate(contract.endDate) : ''}</span>
                    </span>
                    {contract.daysToExpiry !== null && (
                      <span className={contract.daysToExpiry <= 15 ? 'text-sm font-semibold text-red-600' : 'text-sm font-semibold text-amber-700'}>
                        {daysLabel(contract.daysToExpiry)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function AttentionBanner({ attention }: { attention: AdminDashboard['attention'] }) {
  const parts: string[] = [];
  if (attention.pendingApprovals > 0) {
    parts.push(`${attention.pendingApprovals} ${attention.pendingApprovals === 1 ? 'contrato espera' : 'contratos esperan'} aprobación (el más antiguo, desde hace ${daysLabel(attention.oldestPendingDays)})`);
  }
  if (attention.urgentRenewals > 0) parts.push(`${attention.urgentRenewals} ${attention.urgentRenewals === 1 ? 'renovación urgente' : 'renovaciones urgentes'}`);
  if (attention.expiring30 > 0) parts.push(`${attention.expiring30} ${attention.expiring30 === 1 ? 'contrato vence' : 'contratos vencen'} en 30 días`);
  if (parts.length === 0) return null;

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13.5px] text-amber-900">
      <TriangleAlert className="size-[18px] text-amber-700" aria-hidden="true" />
      <span className="min-w-0 flex-1">{parts.join(' · ')}.</span>
      {attention.pendingApprovals > 0 && (
        <Link to="/app/aprobaciones" className="font-semibold underline-offset-2 hover:underline">Revisar aprobaciones</Link>
      )}
    </div>
  );
}

interface MetricKpiProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  metric: AdminDashboard['kpis']['activeContracts'];
  lowerIsBetter?: boolean;
  changeText?: string;
}

function MetricKpi({ label, icon, value, metric, lowerIsBetter, changeText }: MetricKpiProps) {
  const trend = trendOf(metric, lowerIsBetter);
  const hasPrevious = toNumber(metric.previous) !== 0;
  return (
    <Kpi
      label={label}
      icon={icon}
      value={value}
      footer={
        <>
          <span>{hasPrevious ? <><Delta tone={trend}>{changeText ?? percentChange(metric)}</Delta> vs. mes anterior</> : 'Sin datos del mes anterior'}</span>
          <Sparkline values={trendValues(metric)} tone={trend} label={`Tendencia de ${label.toLowerCase()}`} />
        </>
      }
    />
  );
}
