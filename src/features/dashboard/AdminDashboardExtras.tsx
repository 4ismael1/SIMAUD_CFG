import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChartColumn, ChevronRight, FilePlus2, History, LayoutTemplate, Settings, Trophy, UserPlus, Users } from 'lucide-react';
import { Avatar, BarList, Card, CardHeader, EmptyState } from '../../ui';
import { auditActionLabel } from '../../lib/api/audit-labels';
import type { AdminDashboard, DashboardActivity } from '../../lib/api/dashboard-types';
import { roleStatus } from '../../lib/api/status';
import { formatMoneyShort, formatRelative } from '../../lib/format';
import { formatDecimal } from './metrics';

const QUICK_ACTIONS: { to: string; label: string; hint: string; icon: ReactNode }[] = [
  { to: '/app/contratos/nuevo', label: 'Nuevo contrato', hint: 'Desde una plantilla oficial', icon: <FilePlus2 /> },
  { to: '/app/usuarios', label: 'Usuarios', hint: 'Altas, roles y accesos', icon: <UserPlus /> },
  { to: '/app/plantillas', label: 'Plantillas', hint: 'Textos y variables', icon: <LayoutTemplate /> },
  { to: '/app/reportes', label: 'Reportes', hint: 'Indicadores y exportación', icon: <ChartColumn /> },
  { to: '/app/configuracion', label: 'Configuración', hint: 'Sistema y almacenamiento', icon: <Settings /> },
];

/** Shortcuts to everything the administrator operates. */
export function QuickActions() {
  return (
    <nav aria-label="Accesos rápidos" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {QUICK_ACTIONS.map((action) => (
        <Link
          key={action.to}
          to={action.to}
          className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-colors duration-200 group-hover:bg-vino-50 group-hover:text-vino-700 [&_svg]:size-[18px]">
            {action.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-slate-900">{action.label}</span>
            <span className="block truncate text-xs text-slate-500">{action.hint}</span>
          </span>
          <ChevronRight className="hidden size-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-slate-500 sm:block" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}

function Total({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <dt className="truncate text-xs font-medium text-slate-500">{label}</dt>
      <dd className="tabular mt-1 text-xl font-semibold tracking-tight text-slate-900">{value}</dd>
      {hint && <p className="mt-0.5 truncate text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function thisMonth(count: number): string {
  return count > 0 ? `+${formatDecimal(count, 0)} este mes` : 'Sin altas este mes';
}

/** Whole-system totals, as opposed to the KPIs above that only look at what is in force. */
export function TotalsStrip({ totals }: { totals: NonNullable<AdminDashboard['totals']> }) {
  const rate = totals.approvalRate === null ? '—' : `${formatDecimal(totals.approvalRate * 100, 0)} %`;

  return (
    <Card>
      <dl className="grid grid-cols-2 divide-slate-100 max-lg:[&>div:nth-child(n+3)]:border-t max-lg:[&>div:nth-child(even)]:border-l lg:grid-cols-5 lg:divide-x">
        <Total label="Contratos en el sistema" value={formatDecimal(totals.contracts, 0)} hint={thisMonth(totals.newContractsThisMonth)} />
        <Total label="Valor total contratado" value={formatMoneyShort(totals.totalValue)} />
        <Total label="Valor medio" value={totals.averageValue === null ? '—' : formatMoneyShort(totals.averageValue)} />
        <Total label="Tasa de aprobación" value={rate} hint="Aprobados sobre revisados" />
        <Total label="Usuarios" value={formatDecimal(totals.users, 0)} hint={thisMonth(totals.newUsersThisMonth)} />
      </dl>
    </Card>
  );
}

export function TopManagersCard({ rows }: { rows: NonNullable<AdminDashboard['topManagers']> }) {
  const items = rows.map((row) => ({
    key: row.managerId,
    label: row.name,
    value: row.value,
    display: formatMoneyShort(row.value),
    hint: `${row.count} ${row.count === 1 ? 'contrato' : 'contratos'}`,
  }));

  return (
    <Card className="pb-5">
      <CardHeader title="Gestores con más contratación" description="Últimos 90 días, por valor" />
      {rows.length === 0 ? <EmptyState icon={<Trophy />} title="Sin contratos recientes" /> : <BarList items={items} className="px-5 pt-5" />}
    </Card>
  );
}

export function UsersByRoleCard({ rows }: { rows: NonNullable<AdminDashboard['usersByRole']> }) {
  const items = rows.map((row) => ({ key: row.role, label: roleStatus[row.role].label, value: row.count, display: formatDecimal(row.count, 0) }));

  return (
    <Card className="pb-5">
      <CardHeader title="Usuarios por rol" action={<Link to="/app/usuarios" className="text-[13px] font-medium text-vino-600">Administrar</Link>} />
      {rows.length === 0 ? <EmptyState icon={<Users />} title="Sin usuarios" /> : <BarList items={items} color="#475569" className="px-5 pt-5" />}
    </Card>
  );
}

function ActivityRow({ entry }: { entry: DashboardActivity }) {
  const body = (
    <>
      <Avatar name={entry.actorName ?? 'Sistema'} size="sm" tone="muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-slate-900">
          <b className="font-medium">{auditActionLabel(entry.action)}</b>
          {entry.contractCode && <span className="font-mono text-xs text-slate-500"> · {entry.contractCode}</span>}
        </span>
        <span className="block truncate text-xs text-slate-500">
          {entry.actorName ?? 'Sistema'}
          {entry.contractTitle ? ` · ${entry.contractTitle}` : ''}
        </span>
      </span>
      <time dateTime={entry.at} className="shrink-0 text-xs text-slate-400">{formatRelative(entry.at)}</time>
    </>
  );
  const className = 'flex items-center gap-3 px-5 py-2.5';

  return (
    <li className="border-t border-slate-100 first:border-t-0">
      {entry.contractId ? (
        <Link to={`/app/contratos/${entry.contractId}`} className={`${className} transition-colors hover:bg-slate-50`}>{body}</Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}

/** Latest entries of the contract audit trail. Shared by the admin and supervisor panels. */
export function RecentActivityCard({ entries }: { entries: DashboardActivity[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Actividad reciente" description="Lo último que pasó con los contratos" />
      {entries.length === 0 ? (
        <EmptyState icon={<History />} title="Sin actividad todavía" />
      ) : (
        <ol className="mt-3 max-h-[420px] overflow-y-auto">
          {entries.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </Card>
  );
}
