import { Link } from 'react-router-dom';
import { Braces, CircleCheck, Clock, FileStack, LayoutTemplate, Timer, Undo2, X } from 'lucide-react';
import { BarList, ButtonLink, Card, CardHeader, EmptyState, Kpi, cn } from '../../ui';
import type { DashboardDecision, SupervisorDashboard } from '../../lib/api/dashboard-types';
import { formatRelative } from '../../lib/format';
import { RecentActivityCard } from './AdminDashboardExtras';
import { ApprovalRows } from './ApprovalRows';
import { formatDecimal, formatPercent } from './metrics';

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function CatalogStrip({ catalog }: { catalog: NonNullable<SupervisorDashboard['catalog']> }) {
  const items = [
    { label: 'Plantillas activas', value: catalog.activeTemplates, icon: <LayoutTemplate />, to: '/app/plantillas' },
    { label: 'Variables definidas', value: catalog.variables, icon: <Braces />, to: '/app/plantillas' },
    { label: 'Contratos desde plantillas', value: catalog.contractsFromTemplates, icon: <FileStack />, to: '/app/contratos' },
  ];

  return (
    <Card>
      <div className="grid divide-slate-100 max-sm:divide-y sm:grid-cols-3 sm:divide-x">
        {items.map((item) => (
          <Link key={item.label} to={item.to} className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-slate-50">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-colors duration-200 group-hover:bg-vino-50 group-hover:text-vino-700 [&_svg]:size-[18px]">{item.icon}</span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-slate-500">{item.label}</span>
              <span className="tabular block text-xl font-semibold tracking-tight text-slate-900">{formatDecimal(item.value, 0)}</span>
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function TemplateUsageCard({ usage }: { usage: SupervisorDashboard['templateUsage'] }) {
  const items = usage.map((item) => ({ key: item.templateId, label: item.title, value: item.count, display: formatDecimal(item.count, 0) }));

  return (
    <Card className="pb-5">
      <CardHeader title="Plantillas más usadas" description="Por contratos creados" action={<Link to="/app/plantillas" className="text-[13px] font-medium text-vino-600">Gestionar</Link>} />
      {usage.length === 0 ? <EmptyState icon={<LayoutTemplate />} title="Sin uso todavía" description="Aún no hay contratos creados con plantillas." /> : <BarList items={items} className="px-5 pt-5" />}
    </Card>
  );
}

function CategoriesCard({ rows }: { rows: NonNullable<SupervisorDashboard['templatesByCategory']> }) {
  const items = rows.map((row) => ({ key: row.category, label: capitalize(row.category), value: row.count, display: formatDecimal(row.count, 0) }));

  return (
    <Card className="pb-5">
      <CardHeader title="Plantillas por categoría" />
      {rows.length === 0 ? <EmptyState icon={<LayoutTemplate />} title="Sin plantillas" /> : <BarList items={items} color="#475569" className="px-5 pt-5" />}
    </Card>
  );
}

function DecisionRow({ decision }: { decision: DashboardDecision }) {
  const approved = decision.status === 'approved';

  return (
    <li>
      <Link to={`/app/contratos/${decision.contractId}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', approved ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>
          {approved ? <CircleCheck className="size-4" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-slate-900">{decision.title}</span>
          <span className="block truncate text-xs text-slate-500">
            {approved ? 'Aprobado' : 'Devuelto'}
            {decision.comments ? ` · «${decision.comments}»` : ''}
          </span>
        </span>
        <time dateTime={decision.reviewedAt} className="shrink-0 text-xs text-slate-400">{formatRelative(decision.reviewedAt)}</time>
      </Link>
    </li>
  );
}

function DecisionsCard({ decisions }: { decisions: DashboardDecision[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Tus últimas decisiones" />
      {decisions.length === 0 ? (
        <EmptyState icon={<CircleCheck />} title="Aún no has revisado contratos" />
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          {decisions.map((decision) => (
            <DecisionRow key={decision.id} decision={decision} />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SupervisorDashboardView({ data }: { data: SupervisorDashboard }) {
  const { kpis } = data;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Por revisar" icon={<Clock />} value={formatDecimal(kpis.toReview, 0)} emphasis={kpis.toReview > 0 ? 'warning' : undefined} />
        <Kpi label="Aprobados este mes" icon={<CircleCheck />} value={formatDecimal(kpis.approvedThisMonth, 0)} />
        <Kpi label="Devueltos este mes" icon={<Undo2 />} value={formatDecimal(kpis.returnedThisMonth, 0)} footer={<span>{formatPercent(kpis.returnRate)} de lo revisado</span>} />
        <Kpi label="Tu tiempo de respuesta" icon={<Timer />} value={`${formatDecimal(kpis.myAvgResponseDays)} días`} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Cola de aprobación" description="El más antiguo primero" action={<ButtonLink to="/app/aprobaciones" size="sm">Abrir vista de revisión</ButtonLink>} />
        {data.queue.length === 0 ? <EmptyState icon={<CircleCheck />} title="Estás al día" description="No hay contratos esperando tu revisión." /> : <ApprovalRows items={data.queue} withReviewButton />}
      </Card>

      {data.catalog && <CatalogStrip catalog={data.catalog} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <DecisionsCard decisions={data.myRecentDecisions} />
        <div className="flex flex-col gap-4">
          <TemplateUsageCard usage={data.templateUsage} />
          {data.templatesByCategory && <CategoriesCard rows={data.templatesByCategory} />}
        </div>
      </div>

      {data.recentActivity && <RecentActivityCard entries={data.recentActivity} />}
    </>
  );
}
