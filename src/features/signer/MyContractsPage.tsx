import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, Clock, Download, Eye, FileCheck2, FileX2, PenLine } from 'lucide-react';
import { Alert, Button, ButtonLink, Card, EmptyState, PageHeader, Skeleton, Tabs, useAction } from '../../ui';
import type { SignatureInboxItem } from '../../lib/api/contract-types';
import { downloadFromApi } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format';
import { SignatureProgress, StatusBadge } from '../contracts/components/ContractBits';
import { useMyContracts, type MyContractGroup } from './useMyContracts';

/**
 * /app/mis-contratos — every contract the person signs, grouped by where it stands for them:
 * waiting for their signature, waiting for others, in force, finished. Signed contracts offer the
 * final PDF (with its certificate and verification code).
 */

const TABS: { value: MyContractGroup; label: string }[] = [
  { value: 'turn', label: 'Para firmar' },
  { value: 'waiting', label: 'En proceso' },
  { value: 'active', label: 'Vigentes' },
  { value: 'finished', label: 'Finalizados' },
];

const EMPTY: Record<MyContractGroup, { title: string; description: string; icon: typeof PenLine }> = {
  turn: { title: 'Nada que firmar', description: 'Cuando un contrato necesite tu firma aparecerá aquí.', icon: CircleCheck },
  waiting: { title: 'Nada en proceso', description: 'Aquí verás los contratos que ya firmaste y esperan a otras partes.', icon: Clock },
  active: { title: 'Sin contratos vigentes', description: 'Los contratos firmados por todas las partes aparecerán aquí.', icon: FileCheck2 },
  finished: { title: 'Sin contratos finalizados', description: 'Vencidos, cancelados o renovados.', icon: FileX2 },
};

export function MyContractsPage() {
  const { groups, isPending, error } = useMyContracts();
  // Until the person picks a tab: what needs their signature, if anything; otherwise their contracts in force.
  const [chosen, setTab] = useState<MyContractGroup | null>(null);
  const tab: MyContractGroup = chosen ?? (groups.turn.length > 0 ? 'turn' : 'active');
  const rows = groups[tab];
  const empty = EMPTY[tab];

  return (
    <>
      <PageHeader title="Mis contratos" description="Los contratos en los que participas como firmante." />
      <Tabs label="Situación de mis contratos" value={tab} onChange={setTab} items={TABS.map((item) => ({ ...item, count: isPending ? undefined : groups[item.value].length }))} />
      {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<empty.icon />} title={empty.title} description={empty.description} />
        </Card>
      ) : (
        <ul key={tab} className="stagger flex flex-col gap-3 [--stagger-step:50ms]">
          {rows.map((row) => (
            <li key={row.id}>
              <ContractRow row={row} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ContractRow({ row }: { row: SignatureInboxItem }) {
  const { runAction } = useAction();
  const fullySigned = ['active', 'expiring_soon', 'expired', 'renewed'].includes(row.status);
  const mySignature = row.signatory?.signedAt ? `Firmaste el ${formatDateTime(row.signatory.signedAt)}` : row.myTurn ? 'Es tu turno de firmar' : 'Aún no firmas';

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/app/contratos/${row.id}`} className="truncate font-semibold text-slate-900 hover:text-vino-700">
            {row.title}
          </Link>
          <StatusBadge status={row.status} />
        </div>
        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
          <span className="font-mono">{row.code}</span>
          {row.contractValue && <span>{formatMoney(row.contractValue)}</span>}
          {row.startDate && row.endDate && <span>{formatDate(row.startDate)} – {formatDate(row.endDate)}</span>}
          <span className={row.myTurn ? 'font-medium text-amber-700' : undefined}>{mySignature}</span>
        </p>
        <div className="mt-2 max-w-xs">
          <SignatureProgress signed={row.signatures.signed} total={row.signatures.total} />
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {row.myTurn && (
          <ButtonLink to={`/app/contratos/${row.id}/firmar`} variant="primary" size="sm" icon={<PenLine />}>
            Revisar y firmar
          </ButtonLink>
        )}
        <ButtonLink to={`/app/contratos/${row.id}`} size="sm" icon={<Eye />}>
          Ver
        </ButtonLink>
        {fullySigned && (
          <Button
            size="sm"
            icon={<Download />}
            onClick={() =>
              void runAction({
                pending: 'Preparando el PDF…',
                run: () => downloadFromApi(`/contracts/${row.id}/pdf`, `${row.code}.pdf`, { final: true }),
                success: 'PDF descargado.',
              })
            }
          >
            PDF firmado
          </Button>
        )}
      </div>
    </Card>
  );
}
