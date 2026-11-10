/* Dependency-free bar charts built with plain boxes, so they stay sharp at any width and carry real tooltips. */
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface ColumnSeries {
  label: string;
  color: string;
  values: number[];
}

interface ColumnChartProps {
  labels: string[];
  series: ColumnSeries[];
  ariaLabel: string;
  formatValue?: (value: number) => string;
  /** Short form for the y axis (e.g. "1,2 M"). Falls back to formatValue. */
  formatTick?: (value: number) => string;
}

const TICK_COUNT = 4;
const MAX_VISIBLE_LABELS = 12;

function niceCeiling(value: number): number {
  if (value <= 0) return TICK_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

function defaultFormat(value: number): string {
  return value.toLocaleString('es-DO', { maximumFractionDigits: 1 });
}

/** Grouped vertical bars on one shared, zero-based axis. Hover or focus a group to read its exact values. */
export function ColumnChart({ labels, series, ariaLabel, formatValue = defaultFormat, formatTick = formatValue }: ColumnChartProps) {
  const max = niceCeiling(Math.max(0, ...series.flatMap((item) => item.values)));
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, index) => (max / TICK_COUNT) * (TICK_COUNT - index));
  const labelEvery = Math.ceil(labels.length / MAX_VISIBLE_LABELS);

  return (
    <div role="img" aria-label={ariaLabel} className="flex gap-2">
      <div className="tabular flex h-52 flex-col justify-between text-right text-[11px] leading-none text-slate-400" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick}>{formatTick(tick)}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-52">
          <div className="absolute inset-0 flex flex-col justify-between py-[5px]" aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick} className={cn('h-px', tick === 0 ? 'bg-slate-200' : 'bg-slate-100')} />
            ))}
          </div>
          <div className="absolute inset-x-0 top-[5px] bottom-[5px] flex items-end gap-1">
            {labels.map((label, index) => (
              <ColumnGroup
                key={label}
                label={label}
                series={series}
                index={index}
                max={max}
                formatValue={formatValue}
                edge={index < 2 ? 'start' : index >= labels.length - 2 ? 'end' : 'middle'}
              />
            ))}
          </div>
        </div>
        <div className="mt-2 flex gap-1 text-[11px] text-slate-500" aria-hidden="true">
          {labels.map((label, index) => (
            <span key={label} className="min-w-0 flex-1 truncate text-center">
              {index % labelEvery === 0 ? label : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ColumnGroupProps {
  label: string;
  series: ColumnSeries[];
  index: number;
  max: number;
  formatValue: (value: number) => string;
  edge: 'start' | 'middle' | 'end';
}

function ColumnGroup({ label, series, index, max, formatValue, edge }: ColumnGroupProps) {
  return (
    <div tabIndex={0} className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-0.5 rounded-md outline-none hover:bg-slate-50 focus-visible:bg-slate-50">
      {series.map((item) => {
        const value = item.values[index] ?? 0;
        return (
          <span
            key={item.label}
            className="w-full max-w-6 origin-bottom rounded-t-[4px] transition-[height] duration-300 ease-out"
            style={{ height: `${(value / max) * 100}%`, minHeight: value > 0 ? 2 : 0, background: item.color }}
          />
        );
      })}
      <ChartTooltip
        title={label}
        rows={series.map((item) => ({ label: item.label, color: item.color, value: formatValue(item.values[index] ?? 0) }))}
        className={cn(
          'bottom-full mb-1 hidden group-hover:block group-focus-visible:block',
          edge === 'start' ? 'left-0' : edge === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2',
        )}
      />
    </div>
  );
}

interface ChartTooltipProps {
  title: string;
  rows: { label: string; color: string; value: string }[];
  className?: string;
}

export function ChartTooltip({ title, rows, className }: ChartTooltipProps) {
  return (
    <span className={cn('pointer-events-none absolute z-20 w-max max-w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs shadow-pop', className)}>
      <span className="block font-semibold text-slate-900">{title}</span>
      {rows.map((row) => (
        <span key={row.label} className="mt-1 flex items-center gap-2 text-slate-600">
          <span className="size-2 shrink-0 rounded-sm" style={{ background: row.color }} />
          <span className="flex-1">{row.label}</span>
          <b className="tabular font-semibold text-slate-900">{row.value}</b>
        </span>
      ))}
    </span>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export interface BarListItem {
  key: string;
  label: ReactNode;
  value: number;
  /** Text shown at the right; defaults to the formatted value. */
  display?: ReactNode;
  hint?: ReactNode;
}

interface BarListProps {
  items: BarListItem[];
  color?: string;
  className?: string;
}

/** Ranked horizontal bars: one hue, length is the magnitude, the number is always written out. */
export function BarList({ items, color = '#8b2029', className }: BarListProps) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <ul className={cn('flex flex-col gap-3.5', className)}>
      {items.map((item) => (
        <li key={item.key} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-slate-800">{item.label}</span>
            <span className="tabular shrink-0 font-semibold text-slate-900">{item.display ?? defaultFormat(item.value)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <span
              className="block h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${(item.value / max) * 100}%`, minWidth: item.value > 0 ? 4 : 0, background: color }}
            />
          </div>
          {item.hint && <p className="mt-1 text-xs text-slate-500">{item.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
