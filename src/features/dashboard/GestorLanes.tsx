import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleCheck } from 'lucide-react';
import { cn } from '../../ui';
import type { DashboardLane, GestorDashboard } from '../../lib/api/dashboard-types';
import { SignatureProgress } from '../contracts/components/ContractBits';

interface LaneProps {
  title: string;
  dotClass: string;
  items: DashboardLane[];
  empty: string;
  editable?: boolean;
  children: (item: DashboardLane) => ReactNode;
}

function Lane({ title, dotClass, items, empty, editable, children }: LaneProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h3 className="flex items-center gap-2 px-1 text-[13.5px] font-semibold text-slate-900">
        <span className={cn('size-2 rounded-full', dotClass)} aria-hidden="true" />
        {title}
        <span className="tabular ml-auto rounded-full border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600">{items.length}</span>
      </h3>
      {items.length === 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-[13px] text-slate-500">
          <CircleCheck className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          {empty}
        </p>
      )}
      {items.map((item) => (
        <Link
          key={item.id}
          to={editable ? `/app/contratos/${item.id}/editar` : `/app/contratos/${item.id}`}
          className="group flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-3 shadow-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
        >
          <span className="text-[13.5px] font-semibold text-slate-900">{item.title}</span>
          <span className="font-mono text-xs text-slate-500">{item.code}</span>
          {children(item)}
        </Link>
      ))}
    </div>
  );
}

function NextStep({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <span className={cn('flex items-center gap-1 text-[12.5px]', accent ? 'font-semibold text-vino-600' : 'text-slate-500')}>
      {children}
      <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
    </span>
  );
}

/** The gestor's work in progress, grouped by what has to happen next. */
export function GestorLanes({ lanes }: { lanes: GestorDashboard['lanes'] }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="pendientes">
      <h2 id="pendientes" className="text-base font-semibold text-slate-900">Tus pendientes</h2>
      <div className="stagger grid gap-3.5 lg:grid-cols-3">
        <Lane title="Devueltos para corregir" dotClass="bg-red-600" items={lanes.returned} empty="Nada devuelto." editable>
          {(item) => (
            <>
              {item.returnComment && <span className="rounded-md bg-red-50 px-2 py-1.5 text-[12.5px] text-red-800">«{item.returnComment}»</span>}
              <NextStep accent>Corregir y reenviar</NextStep>
            </>
          )}
        </Lane>
        <Lane title="Borradores sin enviar" dotClass="bg-slate-400" items={lanes.drafts} empty="No tienes borradores." editable>
          {() => <NextStep>Completar y enviar a aprobación</NextStep>}
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
  );
}
