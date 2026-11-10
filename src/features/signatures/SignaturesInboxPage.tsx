import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, Clock, PenLine } from 'lucide-react';
import { Alert, Badge, ButtonLink, Card, EmptyState, PageHeader, Pagination, Skeleton, Tabs } from '../../ui';
import { useSignatures } from '../../lib/api/hooks/signatures';
import type { SignatureInboxItem } from '../../lib/api/contract-types';
import { errorMessage } from '../../lib/errors';
import { formatDate, formatMoney } from '../../lib/format';
import { SIGNATORY_ROLE_LABELS } from '../contracts/components/SignatoriesPanel';
import { SignatureProgress, StatusBadge } from '../contracts/components/ContractBits';

type Tab = 'turn' | 'waiting' | 'signed';

/** Pending signatures are few per person; one large page lets us split "my turn" from "waiting". */
const PENDING_PAGE_SIZE = 100;
const SIGNED_PAGE_SIZE = 20;

export function SignaturesInboxPage() {
  const [tab, setTab] = useState<Tab>('turn');
  const [signedPage, setSignedPage] = useState(1);
  const pending = useSignatures('pending', 1, PENDING_PAGE_SIZE);
  const signed = useSignatures('signed', signedPage, SIGNED_PAGE_SIZE);

  const { turn, waiting } = useMemo(() => {
    const rows = pending.data?.data ?? [];
    return { turn: rows.filter((row) => row.myTurn), waiting: rows.filter((row) => !row.myTurn) };
  }, [pending.data]);

  const active = tab === 'signed' ? signed : pending;
  const rows = tab === 'turn' ? turn : tab === 'waiting' ? waiting : (signed.data?.data ?? []);

  return (
    <>
      <PageHeader title="Por firmar" description="Los contratos en los que participas como firmante." />

      <Tabs
        label="Estado de mis firmas"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'turn', label: 'Es tu turno', count: turn.length },
          { value: 'waiting', label: 'Esperando a otro', count: waiting.length },
          { value: 'signed', label: 'Firmados', count: signed.data?.meta.total },
        ]}
      />

      {active.isError && <Alert tone="danger">{errorMessage(active.error)}</Alert>}

      {active.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyInbox tab={tab} />
        </Card>
      ) : (
        <ul key={tab} className="stagger flex flex-col gap-3 [--stagger-step:50ms]">
          {rows.map((row) => (
            <InboxRow key={row.id} row={row} />
          ))}
        </ul>
      )}

      {tab === 'signed' && signed.data && signed.data.meta.total > SIGNED_PAGE_SIZE && (
        <Pagination page={signedPage} pageSize={SIGNED_PAGE_SIZE} total={signed.data.meta.total} onPageChange={setSignedPage} />
      )}
    </>
  );
}

function InboxRow({ row }: { row: SignatureInboxItem }) {
  const role = row.signatory ? SIGNATORY_ROLE_LABELS[row.signatory.role] : null;
  return (
    <li>
      <Card className="lift flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/app/contratos/${row.id}`} className="truncate font-semibold hover:text-vino-700">
              {row.title}
            </Link>
            <StatusBadge status={row.status} />
          </div>
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-slate-500">
            <span className="font-mono">{row.code}</span>
            {role && <span>Firmas como {role.toLowerCase()}</span>}
            {row.contractValue && <span className="tabular">{formatMoney(row.contractValue)}</span>}
            {row.creator && <span>Creado por {row.creator.name}</span>}
          </p>
          <div className="max-w-xs">
            <SignatureProgress signed={row.signatures.signed} total={row.signatures.total} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.myTurn ? (
            <ButtonLink to={`/app/contratos/${row.id}/firmar`} viewTransition variant="primary" icon={<PenLine />}>
              Firmar ahora
            </ButtonLink>
          ) : row.signatory?.signedAt ? (
            <Badge tone="success">Firmaste el {formatDate(row.signatory.signedAt)}</Badge>
          ) : (
            <Badge tone="neutral">Esperando su turno</Badge>
          )}
          <ButtonLink to={`/app/contratos/${row.id}`} variant="ghost">
            Ver
          </ButtonLink>
        </div>
      </Card>
    </li>
  );
}

function EmptyInbox({ tab }: { tab: Tab }) {
  if (tab === 'turn') {
    return <EmptyState icon={<CircleCheck />} title="Nada pendiente" description="No tienes contratos esperando tu firma. Te avisaremos cuando llegue uno." />;
  }
  if (tab === 'waiting') {
    return <EmptyState icon={<Clock />} title="Sin esperas" description="Aquí aparecen los contratos en los que firmas después de otra persona." />;
  }
  return <EmptyState icon={<PenLine />} title="Aún no has firmado contratos" description="Los contratos que firmes quedarán aquí con su PDF." />;
}
