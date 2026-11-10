import { ShieldCheck } from 'lucide-react';
import { Avatar, BarList, Card, CardHeader, ColumnChart, Delta, EmptyState } from '../../ui';
import { roleStatus } from '../../lib/api/status';
import type { ReportsOverview } from '../../lib/api/types';
import { deltaOf, formatCount, formatDays, formatRate } from './report-utils';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3.5 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="tabular mt-0.5 text-xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** What the reviewers decided in the period and how fast each one answered. */
export function ApprovalsCard({ approvals }: { approvals: ReportsOverview['approvals'] }) {
  const rate = approvals.decided > 0 ? approvals.approved / approvals.decided : null;

  return (
    <Card className="pb-5">
      <CardHeader title="Revisión y aprobaciones" description="Decisiones tomadas en el período" />
      <div className="grid grid-cols-2 gap-3 px-5 pt-4 lg:grid-cols-4">
        <Tile label="Decididas" value={formatCount(approvals.decided)} hint={`${formatRate(rate)} aprobadas`} />
        <Tile label="Aprobadas" value={formatCount(approvals.approved)} />
        <Tile label="Devueltas" value={formatCount(approvals.returned)} />
        <Tile label="En espera hoy" value={formatCount(approvals.pending)} />
      </div>
      {approvals.bySupervisor.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="Sin decisiones" description="Nadie revisó contratos en este período." />
      ) : (
        <ul className="mt-4 flex flex-col">
          {approvals.bySupervisor.map((row) => (
            <li key={row.supervisorId} className="flex items-center gap-3 border-t border-slate-100 px-5 py-2.5 text-[13px]">
              <Avatar name={row.name} size="sm" tone="muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-800">{row.name}</span>
                <span className="block text-xs text-slate-500">
                  {formatCount(row.approved)} aprobadas · {formatCount(row.returned)} devueltas
                </span>
              </span>
              <span className="text-right">
                <b className="tabular block font-semibold text-slate-900">{formatDays(row.avgResponseDays)}</b>
                <span className="text-xs text-slate-500">en responder</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Administrators only: who uses the system and how sign-ups evolved. */
export function UsersCard({ users }: { users: NonNullable<ReportsOverview['users']> }) {
  const delta = deltaOf(users.newInRange);
  const roles = users.byRole.map((row) => ({ key: row.role, label: roleStatus[row.role].label, value: row.count }));

  return (
    <Card className="pb-5">
      <CardHeader title="Usuarios" description="Cuentas del sistema y altas del período" />
      <div className="grid grid-cols-3 gap-3 px-5 pt-4">
        <Tile label="Total" value={formatCount(users.total)} />
        <Tile label="Activos" value={formatCount(users.active)} />
        <div className="rounded-lg bg-slate-50 px-3.5 py-3">
          <p className="text-xs text-slate-500">Nuevos</p>
          <p className="tabular mt-0.5 flex items-center gap-2 text-xl font-semibold text-slate-900">
            {formatCount(users.newInRange.value)}
            {delta && <Delta tone={delta.tone}>{delta.text}</Delta>}
          </p>
        </div>
      </div>
      <div className="grid gap-6 px-5 pt-5 md:grid-cols-2">
        <div>
          <p className="mb-3 text-xs font-medium text-slate-500">Por rol</p>
          <BarList items={roles} color="#475569" />
        </div>
        <div>
          <p className="mb-3 text-xs font-medium text-slate-500">Altas por tramo</p>
          <ColumnChart
            labels={users.registrations.map((point) => point.label)}
            series={[{ label: 'Usuarios nuevos', color: '#8b2029', values: users.registrations.map((point) => point.count) }]}
            ariaLabel="Usuarios nuevos por tramo"
          />
        </div>
      </div>
    </Card>
  );
}
