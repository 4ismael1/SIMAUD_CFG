import { Link, useSearchParams } from 'react-router-dom';
import { Download, History, X } from 'lucide-react';
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, Menu, PageHeader, Pagination, SearchInput, Select, useAction, type Column } from '../../ui';
import { auditKey, useAudit, type AuditArea, type AuditEntry, type AuditQuery } from '../../lib/api/hooks/audit';
import { downloadFromApi } from '../../lib/download';
import { formatDateTime } from '../../lib/format';
import type { Tone } from '../../ui';

/**
 * /app/auditoria (admin): who did what and when, across contracts and administration (users,
 * settings, templates, variables, storage). Filters live in the URL; the export uses the same filters.
 */

const PAGE_SIZE = 25;

export const AREA_LABELS: Record<AuditArea, { label: string; tone: Tone }> = {
  contracts: { label: 'Contratos', tone: 'brand' },
  users: { label: 'Usuarios', tone: 'info' },
  settings: { label: 'Configuración', tone: 'neutral' },
  templates: { label: 'Plantillas', tone: 'violet' },
  variables: { label: 'Variables', tone: 'violet' },
  storage: { label: 'Almacenamiento', tone: 'warning' },
  auth: { label: 'Acceso', tone: 'neutral' },
};

const AREAS = Object.keys(AREA_LABELS) as AuditArea[];

export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const { runAction } = useAction();
  const page = Math.max(1, Number(params.get('pagina')) || 1);
  const areaParam = params.get('area');
  const filters: AuditQuery = {
    q: params.get('q') || undefined,
    area: areaParam && areaParam in AREA_LABELS ? (areaParam as AuditArea) : undefined,
    from: params.get('desde') || undefined,
    to: params.get('hasta') || undefined,
  };
  const audit = useAudit({ ...filters, page, pageSize: PAGE_SIZE });
  const hasFilters = Boolean(filters.q || filters.area || filters.from || filters.to);

  function update(changes: Record<string, string>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!('pagina' in changes)) next.delete('pagina');
        return next;
      },
      { replace: true },
    );
  }

  function exportAs(format: 'csv' | 'xlsx') {
    void runAction({
      pending: 'Preparando la exportación…',
      run: () => downloadFromApi('/audit/export', `auditoria.${format}`, { ...filters, format }),
      success: 'Auditoría exportada.',
    });
  }

  const columns: Column<AuditEntry>[] = [
    { key: 'at', header: 'Fecha', cell: (entry) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(entry.at)}</span> },
    { key: 'actor', header: 'Quién', cell: (entry) => <span className="font-medium text-slate-900">{entry.actorName}</span> },
    {
      key: 'area',
      header: 'Área',
      hideOnMobile: true,
      cell: (entry) => <Badge tone={AREA_LABELS[entry.area]?.tone ?? 'neutral'}>{AREA_LABELS[entry.area]?.label ?? entry.area}</Badge>,
    },
    {
      key: 'summary',
      header: 'Qué pasó',
      cell: (entry) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-slate-800">{entry.summary}</span>
          <span className="truncate text-xs text-slate-500">
            {entry.contractId && entry.contractCode ? (
              <Link to={`/app/contratos/${entry.contractId}`} className="font-mono hover:text-vino-700">
                {entry.contractCode}
              </Link>
            ) : (
              entry.contractCode ?? entry.targetLabel
            )}
          </span>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Registro inalterable de quién hizo qué y cuándo: contratos, usuarios, configuración, plantillas y almacenamiento."
        actions={
          <Menu
            items={[
              { label: 'Excel (.xlsx)', onSelect: () => exportAs('xlsx') },
              { label: 'CSV', onSelect: () => exportAs('csv') },
            ]}
            trigger={(props) => (
              <Button icon={<Download />} {...props}>
                Exportar
              </Button>
            )}
          />
        }
      />
      <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-end">
        <SearchInput value={filters.q ?? ''} onChange={(value) => update({ q: value })} placeholder="Buscar por código, contrato, usuario o plantilla" className="w-full lg:max-w-sm lg:flex-1" />
        <Select aria-label="Área" className="w-full lg:w-48" value={filters.area ?? ''} onChange={(event) => update({ area: event.target.value })}>
          <option value="">Todas las áreas</option>
          {AREAS.map((area) => (
            <option key={area} value={area}>
              {AREA_LABELS[area].label}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-2.5 lg:flex">
          <Field label="Desde">
            <Input type="date" value={filters.from ?? ''} max={filters.to} onChange={(event) => update({ desde: event.target.value })} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={filters.to ?? ''} min={filters.from} onChange={(event) => update({ hasta: event.target.value })} />
          </Field>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" icon={<X />} onClick={() => update({ q: '', area: '', desde: '', hasta: '' })}>
            Limpiar
          </Button>
        )}
      </div>
      <Card>
        <DataTable
          caption="Auditoría"
          columns={columns}
          rows={audit.data?.data}
          rowKey={auditKey}
          loading={audit.isPending}
          empty={
            <EmptyState
              icon={<History />}
              title={hasFilters ? 'Nada coincide con los filtros' : 'Sin actividad registrada'}
              description={hasFilters ? 'Prueba con otras fechas o quita algún filtro.' : 'Aquí aparecerá cada cambio en cuanto ocurra.'}
            />
          }
          footer={
            audit.data && audit.data.meta.total > PAGE_SIZE ? (
              <Pagination page={page} pageSize={PAGE_SIZE} total={audit.data.meta.total} onPageChange={(next) => update({ pagina: String(next) })} />
            ) : undefined
          }
        />
      </Card>
    </>
  );
}
