import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, Download, Eye, FileText, Ellipsis, Plus, SearchX } from 'lucide-react';
import {
  Alert,
  ButtonLink,
  type Column,
  DataTable,
  EmptyState,
  IconButton,
  Menu,
  PageHeader,
  Pagination,
  SearchInput,
  Tabs,
  useToast,
} from '../../ui';
import { useContractCounts, useContracts } from '../../lib/api/hooks/contracts';
import { useAuth } from '../../lib/auth';
import type { Contract, ContractStatus } from '../../lib/api/types';
import { formatMoney } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { downloadFromApi } from '../../lib/download';
import { ExpiryCell, SignatureProgress, StatusBadge } from './components/ContractBits';

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

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function ContractsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('estado');
  const tab: TabValue = isTabValue(tabParam) ? tabParam : 'all';
  const page = Math.max(1, Number(searchParams.get('pagina')) || 1);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    updateParams({ q: debouncedSearch || null, pagina: null });
    // Only react to the debounced text; updateParams is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function updateParams(changes: Record<string, string | null>) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  const archived = tab === 'archived';
  const status: ContractStatus | undefined = tab === 'all' || tab === 'archived' ? undefined : tab;
  const contracts = useContracts({ status, archived, q: debouncedSearch || undefined, page, pageSize: PAGE_SIZE, sort: '-updatedAt' });
  const counts = useContractCounts(false);

  const canCreate = user?.role === 'admin' || user?.role === 'gestor';
  const isGestor = user?.role === 'gestor';

  const tabs = TAB_DEFINITIONS.map((definition) => ({
    ...definition,
    count: countFor(definition.value, counts.data),
  }));

  async function downloadPdf(contract: Contract) {
    try {
      await downloadFromApi(`/contracts/${contract.id}/pdf`, `${contract.code}.pdf`);
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo descargar el PDF.'));
    }
  }

  const columns: Column<Contract>[] = [
    {
      key: 'contract',
      header: 'Contrato',
      cell: (contract) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{contract.title}</p>
          <p className="truncate font-mono text-xs text-slate-500">
            {contract.code}
            {contract.template ? ` · ${contract.template.title}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'creator',
      header: 'Gestor',
      cell: (contract) => <span className="text-slate-600">{contract.creator?.name ?? '—'}</span>,
      hideOnMobile: true,
    },
    { key: 'status', header: 'Estado', cell: (contract) => <StatusBadge status={contract.status} /> },
    { key: 'signatures', header: 'Firmas', cell: (contract) => <SignatureProgress {...contract.signatures} /> },
    { key: 'expiry', header: 'Vence', cell: (contract) => <ExpiryCell endDate={contract.endDate} daysToExpiry={contract.daysToExpiry} /> },
    {
      key: 'value',
      header: 'Valor',
      align: 'right',
      cell: (contract) => (contract.contractValue ? formatMoney(contract.contractValue) : '—'),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (contract) => (
        <div onClick={(event) => event.stopPropagation()}>
          <Menu
            items={[
              { label: 'Ver contrato', icon: <Eye />, to: `/app/contratos/${contract.id}` },
              { label: 'Descargar PDF', icon: <Download />, onSelect: () => void downloadPdf(contract) },
            ]}
            trigger={(props) => (
              <IconButton label={`Acciones de ${contract.title}`} size="sm" {...props}>
                <Ellipsis />
              </IconButton>
            )}
          />
        </div>
      ),
    },
  ].filter((column) => !(isGestor && column.key === 'creator'));

  const hasFilters = Boolean(debouncedSearch) || tab !== 'all';

  return (
    <>
      <PageHeader
        title={isGestor ? 'Mis contratos' : 'Contratos'}
        description={counts.data ? `${totalOf(counts.data)} contratos` : undefined}
        actions={
          canCreate && (
            <ButtonLink to="/app/contratos/nuevo" variant="primary" icon={<Plus />}>
              Nuevo contrato
            </ButtonLink>
          )
        }
      />

      <Tabs label="Filtrar por estado" items={tabs} value={tab} onChange={(value) => updateParams({ estado: value === 'all' ? null : value, pagina: null })} />

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por título, cliente o código" className="max-w-sm" />

      {contracts.isError && <Alert tone="danger" title="No se pudieron cargar los contratos">{errorMessage(contracts.error)}</Alert>}

      <DataTable
        caption="Lista de contratos"
        columns={columns}
        rows={contracts.data?.data}
        rowKey={(contract) => contract.id}
        loading={contracts.isPending}
        onRowClick={(contract) => navigate(`/app/contratos/${contract.id}`)}
        empty={
          hasFilters ? (
            <EmptyState icon={<SearchX />} title="Sin resultados" description="Prueba con otro término o cambia de pestaña." />
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
    </>
  );
}

function totalOf(counts: Record<ContractStatus, number>): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function countFor(tab: TabValue, counts: Record<ContractStatus, number> | undefined): number | undefined {
  if (!counts || tab === 'archived') return undefined;
  if (tab === 'all') return totalOf(counts);
  return counts[tab];
}
