import { useMemo, useState } from 'react';
import { CircleCheck, Inbox } from 'lucide-react';
import { Alert, Card, EmptyState, PageHeader, Skeleton, Tabs, cn } from '../../ui';
import { useApprovals } from '../../lib/api/hooks/approvals';
import type { ApprovalQueueItem } from '../../lib/api/contract-types';
import type { ApprovalStatus } from '../../lib/api/core-types';
import { errorMessage } from '../../lib/errors';
import { ApprovalQueue } from './ApprovalQueue';
import { ApprovalReview } from './ApprovalReview';

const TAB_ORDER: ApprovalStatus[] = ['pending', 'approved', 'rejected'];
const TAB_LABELS: Record<ApprovalStatus, string> = { pending: 'Por revisar', approved: 'Aprobados', rejected: 'Devueltos' };

const EMPTY_COPY: Record<ApprovalStatus, { title: string; description: string }> = {
  pending: { title: 'Todo al día', description: 'No hay contratos esperando revisión. Te avisaremos cuando llegue uno.' },
  approved: { title: 'Aún no hay aprobados', description: 'Aquí verás los contratos que ya pasaron la revisión.' },
  rejected: { title: 'Aún no hay devueltos', description: 'Aquí verás los contratos que se devolvieron con observaciones.' },
};

function matchesFilter(item: ApprovalQueueItem, filter: string): boolean {
  const haystack = `${item.contract.title} ${item.contract.code} ${item.requester?.name ?? ''}`.toLowerCase();
  return haystack.includes(filter.toLowerCase());
}

/** Review inbox: the queue on the left, the contract under review on the right (one at a time on phones). */
export function ApprovalsPage() {
  const [status, setStatus] = useState<ApprovalStatus>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const queues: Record<ApprovalStatus, ReturnType<typeof useApprovals>> = {
    pending: useApprovals('pending'),
    approved: useApprovals('approved'),
    rejected: useApprovals('rejected'),
  };
  const current = queues[status];
  const allItems = useMemo(() => current.data ?? [], [current.data]);
  const items = useMemo(() => allItems.filter((item) => matchesFilter(item, filter.trim())), [allItems, filter]);

  const chosenIndex = items.findIndex((item) => item.id === selectedId);
  const hasChosen = chosenIndex >= 0;
  const selectedIndex = hasChosen ? chosenIndex : 0;
  const selected = items[selectedIndex] ?? null;

  function changeTab(next: ApprovalStatus) {
    setStatus(next);
    setSelectedId(null);
    setFilter('');
  }

  return (
    <>
      <PageHeader title="Aprobaciones" description="Lee el contrato, comprueba qué cambió y decide: aprobar para pedir las firmas o devolver con observaciones." />
      <Tabs
        label="Estado de las aprobaciones"
        value={status}
        onChange={changeTab}
        items={TAB_ORDER.map((value) => ({ value, label: TAB_LABELS[value], count: queues[value].data?.length }))}
      />

      {current.isError && <Alert tone="danger">{errorMessage(current.error)}</Alert>}

      {current.isPending ? (
        <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
          <Skeleton className="h-[52dvh] rounded-xl" />
          <Skeleton className="hidden h-[52dvh] rounded-xl lg:block" />
        </div>
      ) : allItems.length === 0 ? (
        <Card>
          <EmptyState icon={status === 'pending' ? <CircleCheck /> : <Inbox />} title={EMPTY_COPY[status].title} description={EMPTY_COPY[status].description} />
        </Card>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className={cn('lg:sticky lg:top-[77px]', hasChosen && 'hidden lg:block')}>
            <ApprovalQueue items={items} selectedId={selected?.id ?? null} search={filter} onSearchChange={setFilter} onSelect={setSelectedId} />
          </div>
          {selected && (
            <div className={cn('min-w-0', !hasChosen && 'hidden lg:block')}>
              <ApprovalReview
                key={selected.id}
                item={selected}
                position={selectedIndex + 1}
                total={items.length}
                onPrevious={selectedIndex > 0 ? () => setSelectedId(items[selectedIndex - 1].id) : undefined}
                onNext={selectedIndex < items.length - 1 ? () => setSelectedId(items[selectedIndex + 1].id) : undefined}
                onBack={() => setSelectedId(null)}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
