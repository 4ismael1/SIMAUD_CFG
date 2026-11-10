import { Link } from 'react-router-dom';
import { CircleCheck, Clock, Undo2, X } from 'lucide-react';
import { ButtonLink, Card, CardHeader, Delta, EmptyState, Kpi } from '../../ui';
import type { SupervisorDashboard } from '../../lib/api/dashboard-types';
import { formatMoney, formatRelative } from '../../lib/format';
import { daysLabel } from '../contracts/components/ContractBits';
import { absoluteChange, formatDecimal, formatPercent, toNumber, trendOf } from './metrics';

export function SupervisorDashboardView({ data }: { data: SupervisorDashboard }) {
  const { kpis } = data;
  const maxUsage = Math.max(1, ...data.templateUsage.map((item) => item.count));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Por revisar" icon={<Clock />} value={formatDecimal(kpis.toReview.value, 0)} emphasis={toNumber(kpis.toReview.value) > 0 ? 'warning' : undefined} />
        <Kpi
          label="Aprobados este mes"
          icon={<CircleCheck />}
          value={formatDecimal(kpis.approvedThisMonth.value, 0)}
          footer={<span><Delta tone={trendOf(kpis.approvedThisMonth)}>{absoluteChange(kpis.approvedThisMonth)}</Delta> vs. mes anterior</span>}
        />
        <Kpi
          label="Devueltos este mes"
          icon={<Undo2 />}
          value={formatDecimal(kpis.returnedThisMonth.value, 0)}
          footer={<span>{formatPercent(kpis.returnRate.value)} del total revisado</span>}
        />
        <Kpi
          label="Tu tiempo de respuesta"
          icon={<Clock />}
          value={`${formatDecimal(kpis.myAvgResponseDays.value)} días`}
          footer={<span><Delta tone={trendOf(kpis.myAvgResponseDays, true)}>{absoluteChange(kpis.myAvgResponseDays)}</Delta> vs. mes anterior</span>}
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Cola de aprobación" description="El más antiguo primero" action={<ButtonLink to="/app/aprobaciones" size="sm">Abrir vista de revisión</ButtonLink>} />
        {data.queue.length === 0 ? (
          <EmptyState icon={<CircleCheck />} title="Estás al día" description="No hay contratos esperando tu revisión." />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
            {data.queue.map((item) => {
              const days = Math.floor(item.ageSeconds / 86_400);
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{item.contract.title}</span>
                    <span className="block font-mono text-xs text-slate-500">
                      {item.contract.code} · {item.requester?.name ?? '—'} · v{item.versionNumber}
                      {item.diff?.contentChanged ? ' · con cambios' : ''}
                    </span>
                  </span>
                  <span className={days >= 2 ? 'text-sm font-semibold text-red-600' : 'text-sm text-slate-500'}>{days === 0 ? 'hoy' : daysLabel(days)}</span>
                  <span className="tabular w-36 text-right text-sm">{item.contract.contractValue ? formatMoney(item.contract.contractValue) : '—'}</span>
                  <ButtonLink to={`/app/aprobaciones?id=${item.id}`} variant="primary" size="sm">Revisar</ButtonLink>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Plantillas más usadas" action={<Link to="/app/plantillas" className="text-[13px] font-medium text-vino-600">Gestionar</Link>} />
          <ul className="flex flex-col gap-3.5 p-5 text-[13.5px]">
            {data.templateUsage.length === 0 && <li className="text-slate-500">Todavía no hay contratos creados con plantillas.</li>}
            {data.templateUsage.map((item) => (
              <li key={item.templateId} className="flex flex-col gap-1.5">
                <span className="flex justify-between gap-2"><span className="truncate">{item.title}</span><b className="tabular">{item.count}</b></span>
                <span className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <span className="block h-full rounded-full bg-vino-600" style={{ width: `${(item.count / maxUsage) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Tus últimas decisiones" />
          <ul className="divide-y divide-slate-100 px-5 py-2">
            {data.myRecentDecisions.length === 0 && <li className="py-3 text-sm text-slate-500">Aún no has revisado contratos.</li>}
            {data.myRecentDecisions.map((decision) => {
              const approved = decision.status === 'approved';
              return (
                <li key={decision.id}>
                  <Link to={`/app/contratos/${decision.contract.id}`} className="flex items-center gap-3 py-3">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${approved ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      {approved ? <CircleCheck className="size-4" /> : <X className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{decision.contract.title}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {approved ? 'Aprobado' : 'Devuelto'}
                        {decision.comments ? ` · «${decision.comments}»` : ''}
                        {decision.reviewedAt ? ` · ${formatRelative(decision.reviewedAt)}` : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
