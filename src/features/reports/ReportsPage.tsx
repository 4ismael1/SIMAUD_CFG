import { useState } from 'react';
import { ChartColumn, Download, FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import { Alert, Button, Card, EmptyState, Menu, PageHeader, Skeleton, cn, useAction } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useReportFilterOptions, useReportsOverview } from '../../lib/api/hooks/reports';
import type { ReportsOverview } from '../../lib/api/types';
import { downloadFromApi } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { ManagersCard, TemplatesCard, TopContractsCard, ValueRangesCard } from './ReportBreakdowns';
import { StatusCard, TimelineCard } from './ReportCharts';
import { ReportFilters } from './ReportFilters';
import { ReportKpis } from './ReportKpis';
import { ApprovalsCard, UsersCard } from './ReportPeople';
import { defaultFilters, toQuery, type ReportFilterState } from './report-utils';

type ExportFormat = 'pdf' | 'xlsx' | 'csv';

const EXPORT_LABELS: Record<ExportFormat, string> = { pdf: 'PDF', xlsx: 'Excel', csv: 'CSV' };

function RangeCaption({ data }: { data: ReportsOverview }) {
  return (
    <p className="text-[13px] text-slate-500">
      Del <b className="font-medium text-slate-700">{formatDate(data.range.from)}</b> al <b className="font-medium text-slate-700">{formatDate(data.range.to)}</b>
      {' · '}comparado con el período anterior ({formatDate(data.previousRange.from)} – {formatDate(data.previousRange.to)})
    </p>
  );
}

function ReportSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-[112px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="h-[340px] rounded-xl" />
        <Skeleton className="h-[340px] rounded-xl" />
      </div>
    </>
  );
}

function ReportBody({ data, showManagers }: { data: ReportsOverview; showManagers: boolean }) {
  return (
    <>
      <ReportKpis kpis={data.kpis} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <TimelineCard timeline={data.timeline} />
        <StatusCard byStatus={data.byStatus} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <TemplatesCard rows={data.byTemplate} />
        <ValueRangesCard rows={data.valueRanges} />
      </div>
      {showManagers && <ManagersCard rows={data.byManager} />}
      <div className="grid gap-5 lg:grid-cols-2">
        <TopContractsCard rows={data.topContracts} />
        <ApprovalsCard approvals={data.approvals} />
      </div>
      {data.users && <UsersCard users={data.users} />}
    </>
  );
}

/** Reports: one set of filters drives every indicator, chart and table, always compared with the previous period. */
export function ReportsPage() {
  const { user } = useAuth();
  const { runAction, running } = useAction();
  const [filters, setFilters] = useState<ReportFilterState>(defaultFilters);
  const rangeInvalid = Boolean(filters.from && filters.to && filters.from > filters.to);
  const query = toQuery(filters);
  const overview = useReportsOverview(query, !rangeInvalid);
  const options = useReportFilterOptions();
  const showManagers = user?.role !== 'gestor';
  const isEmpty = overview.data?.kpis.created.value === 0;

  function exportReport(format: ExportFormat) {
    void runAction({
      run: () => downloadFromApi('/reports/overview/export', `reporte-simaud.${format}`, { ...query, format }),
      pending: `Preparando el reporte en ${EXPORT_LABELS[format]}…`,
      success: `Se descargó el reporte en ${EXPORT_LABELS[format]}.`,
      error: 'No se pudo exportar el reporte.',
    });
  }

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Indicadores, evolución y comparativas de los contratos. Todo responde a los filtros de abajo."
        actions={
          <Menu
            trigger={(props) => (
              <Button variant="primary" icon={<Download />} disabled={rangeInvalid || !overview.data} loading={running} {...props}>
                Exportar
              </Button>
            )}
            items={[
              { label: 'Informe en PDF', icon: <FileText />, onSelect: () => exportReport('pdf') },
              { label: 'Hoja de Excel', icon: <FileSpreadsheet />, onSelect: () => exportReport('xlsx') },
              { label: 'Datos en CSV', icon: <Sheet />, onSelect: () => exportReport('csv') },
            ]}
          />
        }
      />
      <ReportFilters filters={filters} onChange={setFilters} options={options.data} showManager={showManagers} rangeInvalid={rangeInvalid} />

      {overview.isError && (
        <Alert tone="danger" title="No se pudo cargar el reporte" action={<Button size="sm" onClick={() => void overview.refetch()}>Reintentar</Button>}>
          {errorMessage(overview.error)}
        </Alert>
      )}

      {overview.data ? (
        <div className={cn('flex flex-col gap-5 transition-opacity duration-200', overview.isPlaceholderData && 'opacity-60')}>
          <RangeCaption data={overview.data} />
          {isEmpty && (
            <Card>
              <EmptyState icon={<ChartColumn />} title="Sin contratos en este período" description="Prueba con un período más amplio o quita algún filtro." />
            </Card>
          )}
          <ReportBody data={overview.data} showManagers={showManagers} />
        </div>
      ) : (
        overview.isPending && !rangeInvalid && <ReportSkeleton />
      )}
    </>
  );
}
