import { useState } from 'react';
import { History } from 'lucide-react';
import { Card, EmptyState, Pagination, Skeleton } from '../../../ui';
import { useContractAudit, useContractVersions } from '../../../lib/api/hooks/contracts';
import { auditActionLabel } from '../../../lib/api/audit-labels';
import { formatDateTime } from '../../../lib/format';
import { DocumentView } from './DocumentView';

const AUDIT_PAGE_SIZE = 20;

export function ContractActivity({ contractId }: { contractId: string }) {
  const [page, setPage] = useState(1);
  const audit = useContractAudit(contractId, { page, pageSize: AUDIT_PAGE_SIZE });

  if (audit.isPending) return <Skeleton className="h-48 rounded-xl" />;
  const entries = audit.data?.data ?? [];

  return (
    <Card className="overflow-hidden">
      {entries.length === 0 ? (
        <EmptyState icon={<History />} title="Sin actividad registrada" />
      ) : (
        <ol className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3 text-sm">
              <span className="w-40 shrink-0 font-mono text-xs text-slate-500">{formatDateTime(entry.createdAt)}</span>
              <span className="min-w-0 flex-1 font-medium">{auditActionLabel(entry.action)}</span>
              {entry.ip && <span className="font-mono text-xs text-slate-400">IP {entry.ip}</span>}
            </li>
          ))}
        </ol>
      )}
      {audit.data && audit.data.meta.total > AUDIT_PAGE_SIZE && (
        <Pagination page={page} pageSize={AUDIT_PAGE_SIZE} total={audit.data.meta.total} onPageChange={setPage} />
      )}
    </Card>
  );
}

export function ContractVersions({ contractId, currentVersion }: { contractId: string; currentVersion: number }) {
  const versions = useContractVersions(contractId);
  const [selected, setSelected] = useState<number | null>(null);

  if (versions.isPending) return <Skeleton className="h-48 rounded-xl" />;
  const list = [...(versions.data ?? [])].sort((a, b) => b.versionNumber - a.versionNumber);
  const shown = list.find((version) => version.versionNumber === (selected ?? currentVersion)) ?? list[0];

  if (!shown) return <EmptyState icon={<History />} title="Sin versiones" />;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <Card className="h-fit p-2">
        <ul className="flex flex-col gap-1">
          {list.map((version) => {
            const active = version.versionNumber === shown.versionNumber;
            return (
              <li key={version.id}>
                <button
                  type="button"
                  aria-current={active || undefined}
                  onClick={() => setSelected(version.versionNumber)}
                  className={`flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm ${active ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'}`}
                >
                  <span>Versión {version.versionNumber}{version.versionNumber === currentVersion ? ' · actual' : ''}</span>
                  <span className="text-xs font-normal text-slate-500">{formatDateTime(version.createdAt)}</span>
                  {version.changeSummary && <span className="text-xs font-normal text-slate-500">{version.changeSummary}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      <DocumentView content={shown.generatedContent} subheading={`Versión ${shown.versionNumber}`} />
    </div>
  );
}
