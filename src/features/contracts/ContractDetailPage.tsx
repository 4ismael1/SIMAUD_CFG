import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { Alert, ButtonLink, Card, CardHeader, EmptyState, Skeleton, Tabs } from '../../ui';
import { useContract } from '../../lib/api/hooks/contracts';
import { isApiError, errorMessage } from '../../lib/errors';
import type { ContractDetail } from '../../lib/api/types';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format';
import { StatusBadge } from './components/ContractBits';
import { ContractActions } from './components/ContractActions';
import { DocumentView } from './components/DocumentView';
import { SignatoriesPanel } from './components/SignatoriesPanel';
import { ContractActivity, ContractVersions } from './components/ContractHistory';

type DetailTab = 'documento' | 'versiones' | 'actividad';

const TAB_ITEMS: { value: DetailTab; label: string }[] = [
  { value: 'documento', label: 'Documento' },
  { value: 'versiones', label: 'Versiones' },
  { value: 'actividad', label: 'Actividad' },
];

export function ContractDetailPage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const contract = useContract(id);
  const tabParam = searchParams.get('vista');
  const tab: DetailTab = tabParam === 'versiones' || tabParam === 'actividad' ? tabParam : 'documento';

  if (contract.isPending) return <DetailSkeleton />;
  if (contract.isError) {
    if (isApiError(contract.error, 'NOT_FOUND') || isApiError(contract.error, 'FORBIDDEN')) {
      return (
        <EmptyState
          icon={<FileQuestion />}
          title="Contrato no disponible"
          description="No existe o no tienes permiso para verlo."
          action={<ButtonLink to="/app/contratos">Volver a contratos</ButtonLink>}
        />
      );
    }
    return <Alert tone="danger" title="No se pudo cargar el contrato">{errorMessage(contract.error)}</Alert>;
  }

  const data = contract.data;

  return (
    <>
      <Link to="/app/contratos" className="flex items-center gap-1.5 self-start text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Contratos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold">{data.title}</h1>
            <StatusBadge status={data.status} />
            {data.archived && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Archivado</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-mono">{data.code}</span> · versión {data.currentVersion}
            {data.creator ? ` · creado por ${data.creator.name}` : ''} el {formatDate(data.createdAt)}
          </p>
        </div>
        <ContractActions contract={data} />
      </div>

      {data.status === 'rejected' && data.rejectionReason && (
        <Alert tone="danger" title="Devuelto con observaciones">«{data.rejectionReason}»</Alert>
      )}

      <Tabs
        label="Secciones del contrato"
        items={TAB_ITEMS}
        value={tab}
        onChange={(value) => setSearchParams(value === 'documento' ? {} : { vista: value }, { replace: true })}
      />

      {tab === 'documento' && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <DocumentView escapedContent={data.generatedContent} heading={data.title} subheading={`${data.code} · versión ${data.currentVersion}`} />
          <aside className="flex flex-col gap-4">
            <SummaryCard contract={data} />
            <SignatoriesPanel contract={data} canRemind={data.can.cancel} />
          </aside>
        </div>
      )}
      {tab === 'versiones' && <ContractVersions contractId={data.id} currentVersion={data.currentVersion} />}
      {tab === 'actividad' && <ContractActivity contractId={data.id} />}
    </>
  );
}

function SummaryCard({ contract }: { contract: ContractDetail }) {
  const rows: [string, string][] = [
    ['Valor', contract.contractValue ? formatMoney(contract.contractValue) : '—'],
    ['Vigencia', contract.startDate && contract.endDate ? `${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}` : '—'],
    ['Plantilla', contract.template?.title ?? '—'],
    ['Gestor', contract.creator?.name ?? '—'],
    ['Aprobado', contract.approvedAt ? formatDateTime(contract.approvedAt) : '—'],
  ];
  return (
    <Card>
      <CardHeader title="Resumen" />
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2.5 p-5 text-[13.5px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {contract.notes && <p className="border-t border-slate-100 px-5 py-3 text-[13px] text-slate-600">{contract.notes}</p>}
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-[520px] rounded" />
        <Skeleton className="h-[320px] rounded-xl" />
      </div>
    </div>
  );
}
