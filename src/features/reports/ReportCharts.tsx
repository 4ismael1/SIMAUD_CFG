import { useState } from 'react';
import { ChartColumn, ChartPie } from 'lucide-react';
import { Card, CardHeader, ChartLegend, ColumnChart, DonutChart, EmptyState, Segmented, type DonutSlice } from '../../ui';
import { contractStatus } from '../../lib/api/status';
import { CONTRACT_STATUS_COLORS } from '../../lib/api/status-colors';
import type { ReportsOverview, TimelinePoint } from '../../lib/api/types';
import { formatMoney, formatMoneyShort } from '../../lib/format';
import { compactNumber, formatCount } from './report-utils';

type Measure = 'created' | 'value';

const MEASURES: { value: Measure; label: string }[] = [
  { value: 'created', label: 'Contratos' },
  { value: 'value', label: 'Valor' },
];

const CURRENT_COLOR = '#8b2029';
const PREVIOUS_COLOR = '#cbd5e1';

function seriesFor(timeline: TimelinePoint[], measure: Measure) {
  const current = timeline.map((point) => (measure === 'created' ? point.created : point.value));
  const previous = timeline.map((point) => (measure === 'created' ? point.previousCreated : point.previousValue) ?? 0);
  return [
    { label: 'Período anterior', color: PREVIOUS_COLOR, values: previous },
    { label: 'Este período', color: CURRENT_COLOR, values: current },
  ];
}

/** Evolution over time: this period next to the previous one, on a single shared axis. */
export function TimelineCard({ timeline }: { timeline: TimelinePoint[] }) {
  const [measure, setMeasure] = useState<Measure>('created');
  const series = seriesFor(timeline, measure);
  const isMoney = measure === 'value';

  return (
    <Card className="pb-5">
      <CardHeader
        title="Evolución"
        description={isMoney ? 'Valor de los contratos creados en cada tramo' : 'Contratos creados en cada tramo'}
        action={<Segmented label="Medida del gráfico" value={measure} onChange={setMeasure} items={MEASURES} />}
      />
      {timeline.length === 0 ? (
        <EmptyState icon={<ChartColumn />} title="Sin movimientos" description="No se crearon contratos en este período." />
      ) : (
        <div className="px-5 pt-5">
          <ColumnChart
            labels={timeline.map((point) => point.label)}
            series={series}
            ariaLabel={`Evolución de ${isMoney ? 'el valor' : 'los contratos creados'} frente al período anterior`}
            formatValue={isMoney ? formatMoney : formatCount}
            formatTick={isMoney ? formatMoneyShort : compactNumber}
          />
          <div className="mt-4 flex justify-center">
            <ChartLegend items={[...series].reverse()} />
          </div>
        </div>
      )}
    </Card>
  );
}

/** How the contracts of the period are spread across statuses. */
export function StatusCard({ byStatus }: { byStatus: ReportsOverview['byStatus'] }) {
  const rows = byStatus.filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const slices: DonutSlice[] = rows.map((row) => ({ label: contractStatus[row.status].label, value: row.count, color: CONTRACT_STATUS_COLORS[row.status] }));

  return (
    <Card className="pb-5">
      <CardHeader title="Por estado" description="Estado actual de los contratos del período" />
      {total === 0 ? (
        <EmptyState icon={<ChartPie />} title="Sin contratos" description="Nada que repartir en este período." />
      ) : (
        <div className="flex flex-col gap-5 px-5 pt-4">
          <DonutChart slices={slices} centerValue={formatCount(total)} centerLabel="contratos" ariaLabel="Contratos del período por estado" />
          <ul className="flex flex-col gap-2 text-[13px]">
            {rows.map((row) => (
              <li key={row.status} className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CONTRACT_STATUS_COLORS[row.status] }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-slate-700">{contractStatus[row.status].label}</span>
                <span className="tabular text-slate-500">{Math.round((row.count / total) * 100)} %</span>
                <b className="tabular w-10 text-right font-semibold text-slate-900">{formatCount(row.count)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
