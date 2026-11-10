/* Small dependency-free SVG charts sized to their container. */

interface SparklineProps {
  values: number[];
  tone?: 'up' | 'down' | 'flat';
  label: string;
}

const SPARK_COLORS = { up: '#15803d', down: '#dc2626', flat: '#94a3b8' };

export function Sparkline({ values, tone = 'flat', label }: SparklineProps) {
  if (values.length < 2) return null;
  const width = 80;
  const height = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - 3 - ((value - min) / range) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-6 w-20 shrink-0" role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke={SPARK_COLORS[tone]} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export interface LineSeries {
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
  area?: boolean;
}

interface LineChartProps {
  labels: string[];
  series: LineSeries[];
  ariaLabel: string;
}

function niceMax(value: number): number {
  if (value <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** Multi-series line chart with a 0-based y axis and evenly spaced labels. */
export function LineChart({ labels, series, ariaLabel }: LineChartProps) {
  const width = 600;
  const height = 230;
  const left = 40;
  const right = 590;
  const top = 20;
  const bottom = 190;
  const allValues = series.flatMap((item) => item.values);
  const max = niceMax(Math.max(0, ...allValues));
  const ticks = [0, max / 3, (2 * max) / 3, max].map((tick) => Math.round(tick * 10) / 10);
  const xFor = (index: number) => left + 20 + (index / Math.max(1, labels.length - 1)) * (right - left - 40);
  const yFor = (value: number) => bottom - (value / max) * (bottom - top);
  const lastIndex = labels.length - 1;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={ariaLabel}>
      <g className="fill-slate-400 text-[11px]">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={right} y1={yFor(tick)} y2={yFor(tick)} stroke={tick === 0 ? '#e2e8f0' : '#f1f5f9'} />
            <text x={left - 10} y={yFor(tick) + 4} textAnchor="end">{tick.toLocaleString('es-DO')}</text>
          </g>
        ))}
        {labels.map((label, index) => (
          <text key={label} x={xFor(index)} y={bottom + 22} textAnchor="middle" className={index === lastIndex ? 'fill-slate-900 font-semibold' : undefined}>
            {label}
          </text>
        ))}
      </g>
      {series.map((item) => {
        const points = item.values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(' ');
        const lastValue = item.values[item.values.length - 1] ?? 0;
        return (
          <g key={item.label}>
            {item.area && (
              <path d={`M${xFor(0)} ${bottom} L${points.replaceAll(' ', ' L')} L${xFor(lastIndex)} ${bottom} Z`} fill={item.color} fillOpacity="0.08" />
            )}
            <polyline points={points} fill="none" stroke={item.color} strokeWidth="2.2" strokeLinejoin="round" strokeDasharray={item.dashed ? '5 4' : undefined} />
            <circle cx={xFor(lastIndex)} cy={yFor(lastValue)} r="4.5" fill="#fff" stroke={item.color} strokeWidth="2.2" />
          </g>
        );
      })}
    </svg>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
}

export function DonutChart({ slices, centerValue, centerLabel, ariaLabel }: DonutChartProps) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  let offset = 0;

  return (
    <div className="relative grid place-items-center">
      <svg viewBox="0 0 160 160" className="size-[168px] -rotate-90" role="img" aria-label={ariaLabel}>
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="18" />
        {slices
          .filter((slice) => slice.value > 0)
          .map((slice) => {
            const length = (slice.value / total) * circumference;
            const element = (
              <circle
                key={slice.label}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="18"
                strokeDasharray={`${length} ${circumference}`}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return element;
          })}
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="tabular text-[26px] leading-none font-semibold">{centerValue}</span>
        <span className="text-xs text-slate-500">{centerLabel}</span>
      </div>
    </div>
  );
}
