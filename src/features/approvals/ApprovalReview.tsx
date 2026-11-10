import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, ChevronUp, CircleCheck, ExternalLink, Minus, PenLine, Undo2 } from 'lucide-react';
import { Alert, Badge, Button, Card, IconButton, Skeleton, cn, useAction } from '../../ui';
import { useApproveContract, useRejectContract } from '../../lib/api/hooks/approvals';
import { useContract } from '../../lib/api/hooks/contracts';
import type { ApprovalQueueItem } from '../../lib/api/contract-types';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/errors';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format';
import { DocumentView } from '../contracts/components/DocumentView';
import { isWaitingTooLong, waitingLabel } from './ApprovalQueue';

interface ApprovalReviewProps {
  item: ApprovalQueueItem;
  /** 1-based position in the queue and its size, for "2 de 7". */
  position: number;
  total: number;
  onPrevious?: () => void;
  onNext?: () => void;
  onBack: () => void;
}

/** Everything a supervisor needs to decide on one contract: facts, what changed, the document and the decision. */
export function ApprovalReview({ item, position, total, onPrevious, onNext, onBack }: ApprovalReviewProps) {
  const { user } = useAuth();
  const detail = useContract(item.contractId);
  const isOwn = item.requestedBy === user?.id;
  const canDecide = item.status === 'pending' && detail.data?.can.approve === true;

  return (
    <section className="flex min-w-0 animate-page-in flex-col gap-4" aria-label={`Revisión de ${item.contract.title}`}>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-[13px] text-slate-500">
          <button type="button" onClick={onBack} className="-ml-1 flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-slate-600 hover:bg-slate-100 lg:hidden">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Cola
          </button>
          <span className="tabular hidden lg:inline">
            Contrato {position} de {total}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <IconButton label="Contrato anterior" size="sm" disabled={!onPrevious} onClick={onPrevious}>
              <ChevronUp />
            </IconButton>
            <IconButton label="Contrato siguiente" size="sm" disabled={!onNext} onClick={onNext}>
              <ChevronDown />
            </IconButton>
          </span>
        </div>
        <ReviewSummary item={item} />
      </Card>

      {item.diff && <ChangesCard diff={item.diff} versionNumber={item.versionNumber} />}
      {isOwn && item.status === 'pending' && <Alert tone="info">Este contrato lo enviaste tú: otro supervisor debe aprobarlo.</Alert>}
      {item.comments && (
        <Alert tone={item.status === 'rejected' ? 'warning' : 'info'} title={item.status === 'rejected' ? 'Observaciones de la devolución' : 'Observaciones'}>
          {item.comments}
        </Alert>
      )}

      {detail.isError && <Alert tone="danger">{errorMessage(detail.error)}</Alert>}
      {detail.data ? (
        <DocumentView content={detail.data.generatedContent} heading={detail.data.title} subheading={`${detail.data.code} · versión ${item.versionNumber}`} />
      ) : (
        !detail.isError && <Skeleton className="h-[60dvh] rounded-md" />
      )}

      {canDecide && <DecisionBar item={item} />}
    </section>
  );
}

function ReviewSummary({ item }: { item: ApprovalQueueItem }) {
  const { contract } = item;
  const term = contract.startDate && contract.endDate ? `${formatDate(contract.startDate)} → ${formatDate(contract.endDate)}` : 'Sin definir';

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{contract.code}</span>
            <Badge tone="neutral" dot={false}>
              Versión {item.versionNumber}
            </Badge>
            <DecisionBadge item={item} />
          </div>
          <h2 className="mt-1.5 text-xl font-semibold text-slate-900">{contract.title}</h2>
        </div>
        <Link
          to={`/app/contratos/${item.contractId}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md text-sm font-medium text-vino-600 hover:text-vino-700"
        >
          Abrir ficha
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-100 pt-4 xl:grid-cols-4">
        <Fact label="Gestor">{item.requester?.name ?? 'Sistema'}</Fact>
        <Fact label="Valor">{contract.contractValue ? formatMoney(contract.contractValue) : 'Sin valor'}</Fact>
        <Fact label="Vigencia">{term}</Fact>
        <Fact label="Enviado a revisión">{formatDateTime(item.requestedAt)}</Fact>
      </dl>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function DecisionBadge({ item }: { item: ApprovalQueueItem }) {
  if (item.status === 'approved') return <Badge tone="success">Aprobado{item.reviewedAt ? ` el ${formatDate(item.reviewedAt)}` : ''}</Badge>;
  if (item.status === 'rejected') return <Badge tone="warning">Devuelto{item.reviewedAt ? ` el ${formatDate(item.reviewedAt)}` : ''}</Badge>;
  return <Badge tone={isWaitingTooLong(item) ? 'warning' : 'info'}>En espera hace {waitingLabel(item.ageSeconds)}</Badge>;
}

interface ChangesCardProps {
  diff: NonNullable<ApprovalQueueItem['diff']>;
  versionNumber: number;
}

/** Says, part by part, what the manager changed since the version that was returned. */
function ChangesCard({ diff, versionNumber }: ChangesCardProps) {
  const parts = [
    { label: 'Texto del contrato', changed: diff.contentChanged },
    { label: 'Datos y variables', changed: diff.variablesChanged },
    { label: 'Valor y vigencia', changed: diff.detailsChanged },
  ];

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-slate-900">
        Qué cambió entre la versión {diff.previousVersion} y la {versionNumber}
      </h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {parts.map((part) => (
          <li
            key={part.label}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]',
              part.changed ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-500',
            )}
          >
            {part.changed ? <PenLine className="size-4 shrink-0" aria-hidden="true" /> : <Minus className="size-4 shrink-0" aria-hidden="true" />}
            <span className="min-w-0">
              <span className="block truncate font-medium">{part.label}</span>
              <span className="block text-xs">{part.changed ? 'Modificado' : 'Sin cambios'}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The two possible decisions, always in view at the bottom of the review. */
function DecisionBar({ item }: { item: ApprovalQueueItem }) {
  const { runAction } = useAction();
  const approve = useApproveContract(item.contractId);
  const reject = useRejectContract(item.contractId);

  function handleApprove() {
    void runAction({
      confirm: {
        title: `¿Aprobar «${item.contract.title}»?`,
        description: 'Se pedirán las firmas a todas las partes en el orden establecido.',
        confirmLabel: 'Aprobar',
      },
      run: () => approve.mutateAsync(undefined),
      pending: 'Aprobando el contrato…',
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
      pending: 'Devolviendo el contrato…',
      success: 'Contrato devuelto con tus observaciones.',
    });
  }

  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 pl-4 shadow-pop backdrop-blur">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-vino-50 text-vino-700">
        <CircleCheck className="size-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-semibold text-slate-900">Tu decisión</p>
        <p className="text-xs text-slate-500">Al aprobar se piden las firmas. Al devolver, el gestor lo corrige y lo reenvía.</p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button icon={<Undo2 />} onClick={handleReject} className="flex-1 sm:flex-none">
          Devolver
        </Button>
        <Button variant="primary" icon={<Check />} onClick={handleApprove} className="flex-1 sm:flex-none">
          Aprobar
        </Button>
      </div>
    </div>
  );
}
