import { Link } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import { Card, CardHeader, Delta, Kpi, cn } from '../../ui';
import type { GestorDashboard } from '../../lib/api/dashboard-types';
import type { Contract } from '../../lib/api/types';
import { formatDate, formatMoney, formatMoneyShort, formatRelative } from '../../lib/format';
import { SignatureProgress, StatusBadge } from '../contracts/components/ContractBits';
import { formatDecimal, formatPercent, percentChange, trendOf } from './metrics';

export function GestorDashboardView({ data }: { data: GestorDashboard }) {
  const { kpis, lanes } = data;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Mis contratos vigentes"
          value={formatDecimal(kpis.myActive.value, 0)}
          footer={<span><Delta tone={trendOf(kpis.myActive)}>{percentChange(kpis.myActive)}</Delta> vs. mes anterior</span>}
        />
        <Kpi label="Valor gestionado" value={formatMoneyShort(kpis.myValue.value)} footer={<span><Delta tone={trendOf(kpis.myValue)}>{percentChange(kpis.myValue)}</Delta> vs. mes anterior</span>} />
        <Kpi
          label="Aprobados a la primera"
          value={formatPercent(kpis.firstTimeApprovalRate.value)}
          footer={<span>Media institucional: {formatPercent(kpis.institutionFirstTimeApprovalRate.value)}</span>}
        />
        <Kpi label="Firmas pendientes" icon={<PenLine />} value={formatDecimal(kpis.pendingSignatures.value, 0)} />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="pendientes">
        <h2 id="pendientes" className="text-base font-semibold">Tus pendientes</h2>
        <div className="grid gap-3.5 lg:grid-cols-3">
          <Lane title="Devueltos para corregir" dotClass="bg-red-600" contracts={lanes.returned} empty="Nada devuelto. ¡Bien!">
            {(contract) => (
              <>
                <span className="font-mono text-xs text-slate-500">{contract.code}</span>
                {contract.rejectionReason && <span className="rounded-md bg-red-50 px-2 py-1.5 text-[12.5px] text-red-800">«{contract.rejectionReason}»</span>}
                <span className="text-[12.5px] font-semibold text-vino-600">Corregir y reenviar</span>
              </>
            )}
          </Lane>
          <Lane title="Borradores sin enviar" dotClass="bg-slate-400" contracts={lanes.drafts} empty="No tienes borradores.">
            {(contract) => <span className="text-[12.5px] text-slate-500">Editado {formatRelative(contract.updatedAt)}</span>}
          </Lane>
          <Lane title="Esperando firmas" dotClass="bg-blue-700" contracts={lanes.awaitingSignatures} empty="Ningún contrato espera firmas.">
            {(contract) => (
              <span className="flex items-center justify-between gap-2 text-[12.5px] text-slate-500">
                {contract.signatures.total - contract.signatures.signed} pendiente(s)
                <SignatureProgress signed={contract.signatures.signed} total={contract.signatures.total} />
              </span>
            )}
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
                  <span className="block font-mono text-xs text-slate-500">{contract.code}</span>
                </span>
                <StatusBadge status={contract.status} />
                <span className="w-28 text-sm text-slate-500">{contract.endDate ? formatDate(contract.endDate) : '—'}</span>
                <span className="tabular w-36 text-right text-sm">{contract.contractValue ? formatMoney(contract.contractValue) : '—'}</span>
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
  contracts: Contract[];
  empty: string;
  children: (contract: Contract) => React.ReactNode;
}

function Lane({ title, dotClass, contracts, empty, children }: LaneProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-slate-200 bg-slate-100/70 p-3">
      <h3 className="flex items-center gap-2 text-[13.5px] font-semibold">
        <span className={cn('size-2 rounded-full', dotClass)} aria-hidden="true" />
        {title}
        <span className="tabular ml-auto rounded-full border border-slate-200 bg-white px-2 text-xs text-slate-600">{contracts.length}</span>
      </h3>
      {contracts.length === 0 && <p className="px-1 py-2 text-[13px] text-slate-500">{empty}</p>}
      {contracts.map((contract) => (
        <Link
          key={contract.id}
          to={contract.status === 'draft' || contract.status === 'rejected' ? `/app/contratos/${contract.id}/editar` : `/app/contratos/${contract.id}`}
          className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-3 shadow-card hover:border-slate-300"
        >
          <span className="text-[13.5px] font-semibold">{contract.title}</span>
          {children(contract)}
        </Link>
      ))}
    </div>
  );
}
