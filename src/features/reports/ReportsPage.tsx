import { useMemo, useState } from 'react';
import { ChartColumn, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Alert, Button, Card, DataTable, EmptyState, Field, Input, Kpi, PageHeader, Select, Skeleton, Tabs, useAction, type Column } from '../../ui';
import { useReport } from '../../lib/api/hooks/reports';
import type { ReportQuery, ReportRow, ReportType } from '../../lib/api/lifecycle-types';
import { contractStatus, roleStatus } from '../../lib/api/status';
import { downloadFromApi } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { formatMoney } from '../../lib/format';

type GroupBy = NonNullable<ReportQuery['groupBy']>;

const TYPES: { value: ReportType; label: string; groups: { value: GroupBy; label: string }[] }[] = [
  { value: 'contracts', label: 'Contratos', groups: [{ value: 'status', label: 'Estado' }, { value: 'month', label: 'Mes' }, { value: 'template', label: 'Plantilla' }, { value: 'manager', label: 'Gestor' }] },
  { value: 'approvals', label: 'Aprobaciones', groups: [{ value: 'month', label: 'Mes' }, { value: 'status', label: 'Resultado' }] },
  { value: 'users', label: 'Usuarios', groups: [{ value: 'role', label: 'Rol' }, { value: 'activity', label: 'Actividad' }] },
];

/** Human labels for the columns the report endpoints return; unknown keys are humanized. */
const COLUMN_LABELS: Record<string, string> = {
  status: 'Estado', month: 'Mes', template: 'Plantilla', manager: 'Gestor', role: 'Rol', activity: 'Actividad',
  count: 'Cantidad', total: 'Total', value: 'Valor', totalValue: 'Valor total', approved: 'Aprobados', rejected: 'Devueltos',
  pending: 'Pendientes', avgDays: 'Días promedio', active: 'Activos', inactive: 'Inactivos', signed: 'Firmados', created: 'Creados',
};

function labelFor(key: string) {
  return COLUMN_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

function formatCell(key: string, value: string | number | null) {
  if (value === null || value === '') return '—';
  if (key === 'status' && typeof value === 'string' && value in contractStatus) return contractStatus[value as keyof typeof contractStatus].label;
  if (key === 'role' && typeof value === 'string' && value in roleStatus) return roleStatus[value as keyof typeof roleStatus].label;
  if (/value/i.test(key) && !Number.isNaN(Number(value))) return formatMoney(value);
  return String(value);
}

export function ReportsPage() {
  const { runAction } = useAction();
  const [type, setType] = useState<ReportType>('contracts');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const definition = TYPES.find((item) => item.value === type) ?? TYPES[0];
  const [groupBy, setGroupBy] = useState<GroupBy>(definition.groups[0].value);
  const query: ReportQuery = { from: from || undefined, to: to || undefined, groupBy };
  const report = useReport(type, query);
  const rangeInvalid = Boolean(from && to && from > to);

  const columns = useMemo<Column<ReportRow>[]>(() => {
    const keys = Object.keys(report.data?.rows[0] ?? {});
    return keys.map((key, index) => ({
      key,
      header: labelFor(key),
      align: index === 0 ? 'left' : 'right',
      cell: (row) => <span className={index === 0 ? 'font-medium' : 'tabular'}>{formatCell(key, row[key])}</span>,
    }));
  }, [report.data]);

  const totals = Object.entries(report.data?.totals ?? {}).filter(([, value]) => value !== null).slice(0, 4);

  function changeType(next: ReportType) {
    setType(next);
    setGroupBy((TYPES.find((item) => item.value === next) ?? TYPES[0]).groups[0].value);
  }

  function exportAs(format: 'csv' | 'xlsx' | 'pdf') {
    void runAction({
      run: () => downloadFromApi(`/reports/${type}/export`, `reporte-${type}.${format}`, { ...query, format }),
      pending: `Generando el ${format.toUpperCase()}…`,
      success: 'Reporte descargado.',
      error: 'No se pudo generar el reporte.',
    });
  }

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Cifras de la institución para el período que elijas."
        actions={
          <>
            <Button icon={<FileText />} onClick={() => exportAs('pdf')} disabled={rangeInvalid}>PDF</Button>
            <Button icon={<FileSpreadsheet />} onClick={() => exportAs('xlsx')} disabled={rangeInvalid}>Excel</Button>
            <Button icon={<Download />} onClick={() => exportAs('csv')} disabled={rangeInvalid}>CSV</Button>
          </>
        }
      />
      <Tabs label="Tipo de reporte" value={type} onChange={changeType} items={TYPES.map(({ value, label }) => ({ value, label }))} />
      <Card className="grid gap-4 p-4 sm:grid-cols-3">
        <Field label="Desde">
          <Input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="Hasta" error={rangeInvalid ? 'Debe ser posterior a «Desde».' : null}>
          <Input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <Field label="Agrupar por">
          <Select value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)}>
            {definition.groups.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
          </Select>
        </Field>
      </Card>

      {report.isError && <Alert tone="danger">{errorMessage(report.error)}</Alert>}

      {report.isPending ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : (
        <>
          {totals.length > 0 && (
            <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {totals.map(([key, value]) => <Kpi key={key} label={labelFor(key)} value={formatCell(key, value)} />)}
            </div>
          )}
          <Card>
            <DataTable
              caption={`Reporte de ${definition.label.toLowerCase()}`}
              columns={columns}
              rows={report.data?.rows}
              rowKey={(row) => JSON.stringify(row)}
              empty={<EmptyState icon={<ChartColumn />} title="Sin datos" description="No hay registros para estos filtros." />}
            />
          </Card>
        </>
      )}
    </>
  );
}
