import type { ReactNode } from 'react';
import { Ban, CalendarClock, CircleCheck, FilePlus2, PenLine, Scale, Timer, Wallet } from 'lucide-react';
import { Delta, Kpi } from '../../ui';
import type { Comparison, ReportKpis as ReportKpiData } from '../../lib/api/types';
import { formatMoneyShort } from '../../lib/format';
import { deltaOf, formatCount, formatDays, formatRate, type DeltaKind } from './report-utils';

interface KpiDefinition {
  key: keyof ReportKpiData;
  label: string;
  icon: ReactNode;
  format: (value: number | null) => string;
  kind?: DeltaKind;
  lowerIsBetter?: boolean;
  unit?: string;
}

function formatValue(value: number | null): string {
  return value === null ? '—' : formatMoneyShort(value);
}

const DEFINITIONS: KpiDefinition[] = [
  { key: 'created', label: 'Contratos creados', icon: <FilePlus2 />, format: formatCount },
  { key: 'totalValue', label: 'Valor total', icon: <Wallet />, format: formatValue },
  { key: 'averageValue', label: 'Valor promedio', icon: <Scale />, format: formatValue },
  { key: 'activated', label: 'Entraron en vigencia', icon: <CircleCheck />, format: formatCount },
  { key: 'approvalRate', label: 'Tasa de aprobación', icon: <CalendarClock />, format: formatRate, kind: 'points' },
  { key: 'avgApprovalDays', label: 'Tiempo hasta aprobar', icon: <Timer />, format: formatDays, kind: 'absolute', lowerIsBetter: true, unit: ' d' },
  { key: 'avgSigningDays', label: 'Tiempo hasta firmar', icon: <PenLine />, format: formatDays, kind: 'absolute', lowerIsBetter: true, unit: ' d' },
  { key: 'cancelled', label: 'Cancelados', icon: <Ban />, format: formatCount, lowerIsBetter: true },
];

function KpiFooter({ definition, comparison }: { definition: KpiDefinition; comparison: Comparison }) {
  const delta = deltaOf(comparison, definition.kind, definition.lowerIsBetter, definition.unit);

  return (
    <>
      <span className="truncate">Antes: {definition.format(comparison.previous)}</span>
      {delta ? <Delta tone={delta.tone}>{delta.text}</Delta> : <span className="text-slate-400">Sin comparación</span>}
    </>
  );
}

/** Eight headline indicators, each compared with the period right before the chosen one. */
export function ReportKpis({ kpis }: { kpis: ReportKpiData }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {DEFINITIONS.map((definition) => (
        <Kpi
          key={definition.key}
          label={definition.label}
          icon={definition.icon}
          value={definition.format(kpis[definition.key].value)}
          footer={<KpiFooter definition={definition} comparison={kpis[definition.key]} />}
        />
      ))}
    </div>
  );
}
