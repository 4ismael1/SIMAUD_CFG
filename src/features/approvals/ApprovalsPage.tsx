import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CircleCheck, FileText, Undo2 } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Skeleton, Tabs, cn, useAction } from '../../ui';
import { useApprovals, useApproveContract, useRejectContract } from '../../lib/api/hooks/approvals';
import { useContract } from '../../lib/api/hooks/contracts';
import type { ApprovalQueueItem } from '../../lib/api/contract-types';
import type { ApprovalStatus } from '../../lib/api/core-types';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/errors';
import { formatDate, formatMoney } from '../../lib/format';
import { DocumentView } from '../contracts/components/DocumentView';
import { daysLabel } from '../contracts/components/ContractBits';

const TAB_LABELS: Record<ApprovalStatus, string> = { pending: 'Pendientes', approved: 'Aprobados', rejected: 'Devueltos' };

/** Split view: queue on the left, the document under review on the right (stacked on phones). */
export function ApprovalsPage() {
  const [status, setStatus] = useState<ApprovalStatus>('pending');
  const approvals = useApprovals(status);
  const items = useMemo(() => approvals.data ?? [], [approvals.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  useEffect(() => setSelectedId(null), [status]);

  return (
    <>
      <PageHeader title="Aprobaciones" description="Revisa cada contrato antes de que se pidan las firmas." />
      <Tabs
        label="Estado de las aprobaciones"
        value={status}
        onChange={setStatus}
        items={(['pending', 'approved', 'rejected'] as const).map((value) => ({
          value,
          label: TAB_LABELS[value],
          count: value === status ? items.length : undefined,
        }))}
      />

      {approvals.isError && <Alert tone="danger">{errorMessage(approvals.error)}</Alert>}

      {approvals.isPending ? (
        <Skeleton className="h-[60dvh] rounded-xl" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CircleCheck />}
            title={status === 'pending' ? 'Todo al día' : 'Sin registros'}
            description={status === 'pending' ? 'No hay contratos esperando revisión.' : 'Todavía no hay contratos en esta lista.'}
          />
        </Card>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <ul className="stagger flex flex-col gap-2 [--stagger-step:40ms] lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-1">
            {items.map((item) => (
              <li key={item.id}>
                <QueueItem item={item} selected={item.id === selected?.id} onSelect={() => setSelectedId(item.id)} />
              </li>
            ))}
          </ul>
          {selected && <ReviewPanel key={selected.id} item={selected} />}
        </div>
      )}
    </>
  );
}

function QueueItem({ item, selected, onSelect }: { item: ApprovalQueueItem; selected: boolean; onSelect: () => void }) {
  const days = Math.floor(item.ageSeconds / 86400);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full flex-col gap-1 rounded-xl border bg-white p-3.5 text-left transition-all duration-150',
        selected ? 'border-vino-300 shadow-pop ring-2 ring-vino-100' : 'border-slate-200 hover:border-slate-300 hover:shadow-card',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">{item.contract.title}</span>
        {item.status === 'pending' && days >= 2 && <Badge tone="warning">{daysLabel(days)}</Badge>}
      </span>
      <span className="text-xs text-slate-500">
        <span className="font-mono">{item.contract.code}</span> · v{item.versionNumber} · {item.requester?.name ?? 'Sistema'}
      </span>
      {item.diff && (
        <span className="text-xs text-amber-700">
          Cambios desde v{item.diff.previousVersion}:{' '}
          {[item.diff.contentChanged && 'texto', item.diff.variablesChanged && 'datos', item.diff.detailsChanged && 'condiciones'].filter(Boolean).join(', ') ||
            'ninguno'}
        </span>
      )}
    </button>
  );
}

function ReviewPanel({ item }: { item: ApprovalQueueItem }) {
  const { user } = useAuth();
  const { runAction } = useAction();
  const detail = useContract(item.contractId);
  const approve = useApproveContract(item.contractId);
  const reject = useRejectContract(item.contractId);
  const isOwn = item.requestedBy === user?.id;
  const canDecide = item.status === 'pending' && detail.data?.can.approve === true;

  function handleApprove() {
    void runAction({
      confirm: {
        title: `¿Aprobar «${item.contract.title}»?`,
        description: 'Se pedirán las firmas a todas las partes en el orden establecido.',
        confirmLabel: 'Aprobar',
      },
      run: () => approve.mutateAsync(undefined),
      success: 'Contrato aprobado. Se notificó a los firmantes.',
    });
  }

  function handleReject() {
    void runAction({
      confirm: {
        title: `Devolver «${item.contract.title}»`,
        description: 'El gestor recibirá tus observaciones y podrá corregirlo.',
        confirmLabel: 'Devolver',
        reasonLabel: 'Observaciones para el gestor',
      },
      run: (comment) => reject.mutateAsync({ comment: comment ?? '' }),
      success: 'Contrato devuelto con tus observaciones.',
    });
  }

  return (
    <section className="flex min-w-0 animate-page-in flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{item.contract.title}</p>
          <p className="text-[13px] text-slate-500">
            {item.contract.contractValue ? formatMoney(item.contract.contractValue) : 'Sin valor'} ·{' '}
            {item.contract.startDate && item.contract.endDate
              ? `${formatDate(item.contract.startDate)} → ${formatDate(item.contract.endDate)}`
              : 'Sin vigencia'}
          </p>
        </div>
        <Link to={`/app/contratos/${item.contractId}`} className="flex items-center gap-1.5 text-sm font-medium text-vino-600 hover:text-vino-700">
          <FileText className="size-4" aria-hidden="true" />
          Ver ficha completa
        </Link>
        {canDecide && (
          <div className="flex gap-2">
            <Button icon={<Undo2 />} onClick={handleReject}>Devolver</Button>
            <Button variant="primary" icon={<Check />} onClick={handleApprove}>Aprobar</Button>
          </div>
        )}
      </Card>

      {isOwn && item.status === 'pending' && <Alert tone="info">Este contrato lo enviaste tú: otro supervisor debe aprobarlo.</Alert>}
      {item.comments && (
        <Alert tone={item.status === 'rejected' ? 'warning' : 'info'} title="Observaciones">
          {item.comments}
        </Alert>
      )}

      {detail.isError && <Alert tone="danger">{errorMessage(detail.error)}</Alert>}
      {detail.data ? (
        <DocumentView escapedContent={detail.data.generatedContent} heading={detail.data.title} subheading={`${detail.data.code} · versión ${item.versionNumber}`} />
      ) : (
        <Skeleton className="h-[60dvh] rounded-md" />
      )}
    </section>
  );
}
