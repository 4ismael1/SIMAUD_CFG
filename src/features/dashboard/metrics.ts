import type { Metric } from '../../lib/api/dashboard-types';

export type Trend = 'up' | 'down' | 'flat';

export function toNumber(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Direction of change vs. the previous period. `lowerIsBetter` flips the color meaning (e.g. approval time). */
export function trendOf(metric: Metric, lowerIsBetter = false): Trend {
  const current = toNumber(metric.value);
  const previous = toNumber(metric.previous);
  if (current === previous) return 'flat';
  const improved = lowerIsBetter ? current < previous : current > previous;
  return improved ? 'up' : 'down';
}

/** "+9,0 %" relative change; "—" when there is no previous value to compare with. */
export function percentChange(metric: Metric): string {
  const current = toNumber(metric.value);
  const previous = toNumber(metric.previous);
  if (previous === 0) return '—';
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toLocaleString('es-DO', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
}

export function absoluteChange(metric: Metric, unit = ''): string {
  const change = toNumber(metric.value) - toNumber(metric.previous);
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toLocaleString('es-DO', { maximumFractionDigits: 1 })}${unit}`;
}

export function trendValues(metric: Metric): number[] {
  return metric.trend.map(toNumber);
}

const MONTH_LABELS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-06" → "jun". */
export function monthLabel(isoMonth: string): string {
  const month = Number(isoMonth.slice(5, 7));
  return MONTH_LABELS[month - 1] ?? isoMonth;
}

export function formatDecimal(value: number | string, digits = 1): string {
  return toNumber(value).toLocaleString('es-DO', { maximumFractionDigits: digits });
}

export function formatPercent(value: number | string): string {
  return `${Math.round(toNumber(value))} %`;
}
