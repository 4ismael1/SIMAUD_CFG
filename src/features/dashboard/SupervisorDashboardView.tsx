import { Link } from 'react-router-dom';
import { CircleCheck, Clock, Undo2, X } from 'lucide-react';
import { ButtonLink, Card, CardHeader, EmptyState, Kpi } from '../../ui';
import type { SupervisorDashboard } from '../../lib/api/dashboard-types';
import { formatRelative } from '../../lib/format';
import { ApprovalRows } from './ApprovalRows';
import { formatDecimal, formatPercent } from './metrics';

export function SupervisorDashboardView({ data }: { data: SupervisorDashboard }) {
  const { kpis } = data;
  const maxUsage = Math.max(1, ...data.templateUsage.map((item) => item.count));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Por revisar" icon={<Clock />} value={formatDecimal(kpis.toReview, 0)} emphasis={kpis.toReview > 0 ? 'warning' : undefined} />
        <Kpi label="Aprobados este mes" icon={<CircleCheck />} value={formatDecimal(kpis.approvedThisMonth, 0)} />
        <Kpi
          label="Devueltos este mes"
          icon={<Undo2 />}
          value={formatDecimal(kpis.returnedThisMonth, 0)}
          footer={<span>{formatPercent(kpis.returnRate)} de lo revisado</span>}
        />
        <Kpi label="Tu tiempo de respuesta" icon={<Clock />} value={`${formatDecimal(kpis.myAvgResponseDays)} días`} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Cola de aprobación" description="El más antiguo primero" action={<ButtonLink to="/app/aprobaciones" size="sm">Abrir vista de revisión</ButtonLink>} />
        {data.queue.length === 0 ? (
          <EmptyState icon={<CircleCheck />} title="Estás al día" description="No hay contratos esperando tu revisión." />
        ) : (
          <ApprovalRows items={data.queue} withReviewButton />
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
                  <Link to={`/app/contratos/${decision.contractId}`} className="flex items-center gap-3 py-3">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${approved ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      {approved ? <CircleCheck className="size-4" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{decision.title}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {approved ? 'Aprobado' : 'Devuelto'}
                        {decision.comments ? ` · «${decision.comments}»` : ''} · {formatRelative(decision.reviewedAt)}
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
