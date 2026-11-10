import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, Ellipsis, FileText, Plus, SearchX } from 'lucide-react';
import { Alert, ButtonLink, type Column, DataTable, EmptyState, IconButton, Menu, type MenuItem, PageHeader, Pagination, Tabs } from '../../ui';
import { useContractCounts, useContracts } from '../../lib/api/hooks/contracts';
import { useReportFilterOptions } from '../../lib/api/hooks/reports';
import { useAuth } from '../../lib/auth';
import type { Contract, ContractStatus } from '../../lib/api/types';
import { formatMoney } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { BulkBar } from './admin/BulkBar';
import { useContractRowActions } from './admin/useContractRowActions';
import { useRowSelection } from './admin/useRowSelection';
import { ExpiryCell, SignatureProgress, StatusBadge } from './components/ContractBits';
import { ContractListFilters, DEFAULT_SORT, isContractSort } from './ContractListFilters';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type TabValue = 'all' | 'draft' | 'pending_approval' | 'rejected' | 'pending_signatures' | 'active' | 'expiring_soon' | 'archived';

const TAB_DEFINITIONS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'draft', label: 'Borradores' },
  { value: 'pending_approval', label: 'En aprobación' },
  { value: 'rejected', label: 'Devueltos' },
  { value: 'pending_signatures', label: 'Por firmar' },
  { value: 'active', label: 'Vigentes' },
  { value: 'expiring_soon', label: 'Por vencer' },
  { value: 'archived', label: 'Archivados' },
];

function isTabValue(value: string | null): value is TabValue {
  return TAB_DEFINITIONS.some((tab) => tab.value === value);
}

function totalOf(counts: Record<ContractStatus, number>): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function countFor(tab: TabValue, counts: Record<ContractStatus, number> | undefined): number | undefined {
  if (!counts || tab === 'archived') return undefined;
  if (tab === 'all') return totalOf(counts);
  return counts[tab];
}

function ContractCell({ contract }: { contract: Contract }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-semibold text-slate-900">{contract.title}</p>
      <p className="truncate font-mono text-xs text-slate-500">
        {contract.code}
        {contract.template ? ` · ${contract.template.title}` : ''}
      </p>
    </div>
  );
}

function RowMenu({ contract, items }: { contract: Contract; items: MenuItem[] }) {
  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Menu
        items={items}
        trigger={(props) => (
          <IconButton label={`Acciones de ${contract.title}`} size="sm" {...props}>
            <Ellipsis />
          </IconButton>
        )}
      />
    </div>
  );
}

function buildColumns(menuFor: (contract: Contract) => MenuItem[]): Column<Contract>[] {
  return [
    { key: 'contract', header: 'Contrato', cell: (contract) => <ContractCell contract={contract} /> },
    { key: 'creator', header: 'Gestor', hideOnMobile: true, cell: (contract) => <span className="text-slate-600">{contract.creator?.name ?? '—'}</span> },
    { key: 'status', header: 'Estado', cell: (contract) => <StatusBadge status={contract.status} /> },
    { key: 'signatures', header: 'Firmas', cell: (contract) => <SignatureProgress {...contract.signatures} /> },
    { key: 'expiry', header: 'Vence', cell: (contract) => <ExpiryCell endDate={contract.endDate} daysToExpiry={contract.daysToExpiry} /> },
    { key: 'value', header: 'Valor', align: 'right', cell: (contract) => (contract.contractValue ? formatMoney(contract.contractValue) : '—') },
    { key: 'actions', header: '', className: 'w-12', cell: (contract) => <RowMenu contract={contract} items={menuFor(contract)} /> },
  ];
}

export function ContractsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const isGestor = user?.role === 'gestor';
  const canCreate = isAdmin || isGestor;

  const tabParam = searchParams.get('estado');
  const tab: TabValue = isTabValue(tabParam) ? tabParam : 'all';
  const page = Math.max(1, Number(searchParams.get('pagina')) || 1);
  const templateId = searchParams.get('plantilla') ?? '';
  const managerId = isGestor ? '' : (searchParams.get('gestor') ?? '');
  const sortParam = searchParams.get('orden');
  const sort = isContractSort(sortParam) ? sortParam : DEFAULT_SORT;
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  function updateParams(changes: Record<string, string | null | undefined>) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === undefined) continue;
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    if ((searchParams.get('q') ?? '') !== debouncedSearch) updateParams({ q: debouncedSearch, pagina: null });
    // Only react to the debounced text; updateParams is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const archived = tab === 'archived';
  const status: ContractStatus | undefined = tab === 'all' || archived ? undefined : tab;
  const contracts = useContracts({
    status,
    archived,
    q: debouncedSearch || undefined,
    templateId: templateId || undefined,
    createdBy: managerId || undefined,
    page,
    pageSize: PAGE_SIZE,
    sort,
  });
  const counts = useContractCounts(false);
  const options = useReportFilterOptions();
  const rows = contracts.data?.data;

  const { menuFor, dialogs } = useContractRowActions(user?.role);
  const selection = useRowSelection<Contract>(rows, (contract) => contract.id, (contract) => contract.code);
  // A gestor only sees their own contracts, so the "Gestor" column would always repeat their name.
  const baseColumns = buildColumns(menuFor).filter((column) => !(isGestor && column.key === 'creator'));
  const columns = isAdmin ? [selection.column, ...baseColumns] : baseColumns;
  const tabs = TAB_DEFINITIONS.map((definition) => ({ ...definition, count: countFor(definition.value, counts.data) }));
  const hasFilters = Boolean(debouncedSearch || templateId || managerId) || tab !== 'all';

  function clearFilters() {
    setSearch('');
    updateParams({ q: null, plantilla: null, gestor: null, orden: null, pagina: null });
  }

  return (
    <>
      <PageHeader
        title={isGestor ? 'Mis contratos' : 'Contratos'}
        description={counts.data ? `${totalOf(counts.data)} contratos` : undefined}
        actions={canCreate && <ButtonLink to="/app/contratos/nuevo" variant="primary" icon={<Plus />}>Nuevo contrato</ButtonLink>}
      />

      <Tabs label="Filtrar por estado" items={tabs} value={tab} onChange={(value) => updateParams({ estado: value === 'all' ? null : value, pagina: null })} />

      <ContractListFilters
        search={search}
        onSearchChange={setSearch}
        templateId={templateId}
        managerId={managerId}
        sort={sort}
        options={options.data}
        showManager={!isGestor}
        onChange={(changes) => updateParams({ ...changes, pagina: null })}
        onClear={clearFilters}
      />

      {contracts.isError && <Alert tone="danger" title="No se pudieron cargar los contratos">{errorMessage(contracts.error)}</Alert>}

      <DataTable
        caption="Lista de contratos"
        columns={columns}
        rows={rows}
        rowKey={(contract) => contract.id}
        selectedKeys={selection.selectedKeys}
        mobileTitle={(contract) => <ContractCell contract={contract} />}
        loading={contracts.isPending}
        onRowClick={(contract) => navigate(`/app/contratos/${contract.id}`)}
        empty={
          hasFilters ? (
            <EmptyState icon={<SearchX />} title="Sin resultados" description="Prueba con otro término, quita algún filtro o cambia de pestaña." />
          ) : (
            <EmptyState
              icon={archived ? <Archive /> : <FileText />}
              title={archived ? 'No hay contratos archivados' : 'Todavía no hay contratos'}
              description={canCreate ? 'Crea el primero a partir de una plantilla oficial.' : undefined}
              action={canCreate ? <ButtonLink to="/app/contratos/nuevo" variant="primary" icon={<Plus />}>Nuevo contrato</ButtonLink> : undefined}
            />
          )
        }
        footer={
          contracts.data && contracts.data.meta.total > PAGE_SIZE ? (
            <Pagination page={page} pageSize={PAGE_SIZE} total={contracts.data.meta.total} onPageChange={(next) => updateParams({ pagina: String(next) })} />
          ) : null
        }
      />

      {isAdmin && <BulkBar selectedIds={selection.selectedIds} archivedView={archived} onDone={selection.clear} />}
      {dialogs}
    </>
  );
}
