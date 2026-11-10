import { Link } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import { Card, CardHeader, Kpi, cn } from '../../ui';
import type { DashboardLane, GestorDashboard } from '../../lib/api/dashboard-types';
import { formatMoney, formatMoneyShort, formatRelative } from '../../lib/format';
import { SignatureProgress, StatusBadge } from '../contracts/components/ContractBits';
import { formatDecimal, formatPercent } from './metrics';

export function GestorDashboardView({ data }: { data: GestorDashboard }) {
  const { kpis, lanes } = data;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Mis contratos vigentes" value={formatDecimal(kpis.myActive, 0)} />
        <Kpi label="Valor gestionado" value={formatMoneyShort(kpis.myValue)} />
        <Kpi
          label="Aprobados a la primera"
          value={formatPercent(kpis.firstTimeApprovalRate)}
          footer={<span>Media institucional: {formatPercent(kpis.institutionFirstTimeApprovalRate)}</span>}
        />
        <Kpi label="Firmas pendientes" icon={<PenLine />} value={formatDecimal(kpis.pendingSignatures, 0)} />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="pendientes">
        <h2 id="pendientes" className="text-base font-semibold">Tus pendientes</h2>
        <div className="grid gap-3.5 lg:grid-cols-3">
          <Lane title="Devueltos para corregir" dotClass="bg-red-600" items={lanes.returned} empty="Nada devuelto." editable>
            {(item) => (
              <>
                {item.returnComment && <span className="rounded-md bg-red-50 px-2 py-1.5 text-[12.5px] text-red-800">«{item.returnComment}»</span>}
                <span className="text-[12.5px] font-semibold text-vino-600">Corregir y reenviar</span>
              </>
            )}
          </Lane>
          <Lane title="Borradores sin enviar" dotClass="bg-slate-400" items={lanes.drafts} empty="No tienes borradores." editable>
            {() => <span className="text-[12.5px] text-slate-500">Completa y envía a aprobación</span>}
          </Lane>
          <Lane title="Esperando firmas" dotClass="bg-blue-700" items={lanes.awaitingSignatures} empty="Ningún contrato espera firmas.">
            {(item) =>
              item.total !== undefined && (
                <span className="flex items-center justify-between gap-2 text-[12.5px] text-slate-500">
                  {item.total - (item.signed ?? 0)} pendiente(s)
                  <SignatureProgress signed={item.signed ?? 0} total={item.total} />
                </span>
              )
            }
          </Lane>
        </div>
      </section>

      <Card className="overflow-hidden">
        <CardHeader title="Mis contratos recientes" action={<Link to="/app/contratos" className="text-[13px] font-medium text-vino-600">Ver todos</Link>} />
        <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          {data.recent.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">Aún no has creado contratos.</li>}
          {data.recent.map((contract) => (
            <li key={contract.id}>
              <Link to={`/app/contratos/${contract.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{contract.title}</span>
                  <span className="block font-mono text-xs text-slate-500">{contract.code} · {formatRelative(contract.updatedAt)}</span>
                </span>
                <StatusBadge status={contract.status} />
                <span className="tabular w-36 text-right text-sm">{contract.value ? formatMoney(contract.value) : '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

interface LaneProps {
  title: string;
  dotClass: string;
  items: DashboardLane[];
  empty: string;
  editable?: boolean;
  children: (item: DashboardLane) => React.ReactNode;
}

function Lane({ title, dotClass, items, empty, editable, children }: LaneProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-slate-200 bg-slate-100/70 p-3">
      <h3 className="flex items-center gap-2 text-[13.5px] font-semibold">
        <span className={cn('size-2 rounded-full', dotClass)} aria-hidden="true" />
        {title}
        <span className="tabular ml-auto rounded-full border border-slate-200 bg-white px-2 text-xs text-slate-600">{items.length}</span>
      </h3>
      {items.length === 0 && <p className="px-1 py-2 text-[13px] text-slate-500">{empty}</p>}
      {items.map((item) => (
        <Link
          key={item.id}
          to={editable ? `/app/contratos/${item.id}/editar` : `/app/contratos/${item.id}`}
          className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-3 shadow-card hover:border-slate-300"
        >
          <span className="text-[13.5px] font-semibold">{item.title}</span>
          <span className="font-mono text-xs text-slate-500">{item.code}</span>
          {children(item)}
        </Link>
      ))}
    </div>
  );
}
