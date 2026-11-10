import { compareMoney, moneyChangePercent } from "../../lib/format";
import type {
  Comparison,
  ContractStatus,
  DateRange,
  ReportGranularity,
  ReportsOverviewQuery,
} from "../../lib/api/types";

export type PresetId = "30d" | "90d" | "12m" | "ytd" | "custom";

export interface ReportFilterState {
  preset: PresetId;
  from: string;
  to: string;
  status: ContractStatus | "";
  templateId: string;
  managerId: string;
  granularity: ReportGranularity;
}

export const PRESETS: { value: PresetId; label: string }[] = [
  { value: "30d", label: "30 días" },
  { value: "90d", label: "90 días" },
  { value: "12m", label: "12 meses" },
  { value: "ytd", label: "Este año" },
  { value: "custom", label: "Personalizado" },
];

export const GRANULARITIES: { value: ReportGranularity; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "quarter", label: "Trimestre" },
  { value: "year", label: "Año" },
];

function toIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Inclusive date range that a preset stands for, counted back from `today`. */
export function rangeForPreset(
  preset: Exclude<PresetId, "custom">,
  today = new Date(),
): DateRange {
  const start = new Date(today);
  if (preset === "30d") start.setDate(start.getDate() - 29);
  if (preset === "90d") start.setDate(start.getDate() - 89);
  if (preset === "12m") {
    start.setFullYear(start.getFullYear() - 1);
    start.setDate(start.getDate() + 1);
  }
  if (preset === "ytd") start.setMonth(0, 1);
  return { from: toIsoDay(start), to: toIsoDay(today) };
}

const DEFAULT_PRESET = "90d";

export function defaultFilters(): ReportFilterState {
  return {
    preset: DEFAULT_PRESET,
    ...rangeForPreset(DEFAULT_PRESET),
    status: "",
    templateId: "",
    managerId: "",
    granularity: "month",
  };
}

export function activeFilterCount(filters: ReportFilterState): number {
  return (
    [filters.status, filters.templateId, filters.managerId].filter(Boolean)
      .length + (filters.preset === DEFAULT_PRESET ? 0 : 1)
  );
}

export function toQuery(filters: ReportFilterState): ReportsOverviewQuery {
  return {
    from: filters.from || undefined,
    to: filters.to || undefined,
    status: filters.status || undefined,
    templateId: filters.templateId || undefined,
    managerId: filters.managerId || undefined,
    granularity: filters.granularity,
  };
}

export type DeltaKind = "percent" | "points" | "absolute";
export type DeltaTone = "up" | "down" | "flat";

export interface DeltaView {
  text: string;
  tone: DeltaTone;
}

function signed(value: number, digits: number): string {
  const sign = value > 0 ? "+" : "";
  return (
    sign +
    value.toLocaleString("es-DO", {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    })
  );
}

function deltaText(
  current: number,
  previous: number,
  kind: DeltaKind,
  unit: string,
): string | null {
  if (kind === "points") return `${signed((current - previous) * 100, 1)} pts`;
  if (kind === "absolute") return `${signed(current - previous, 1)}${unit}`;
  if (previous === 0) return null;
  return `${signed(((current - previous) / previous) * 100, 1)} %`;
}

/** Change against the previous period, colored by whether it is good news. Null when there is nothing to compare. */
export function deltaOf(
  comparison: Comparison<string | number>,
  kind: DeltaKind = "percent",
  lowerIsBetter = false,
  unit = "",
): DeltaView | null {
  const { value, previous } = comparison;
  if (value === null || previous === null) return null;
  if (typeof value === "string" && typeof previous === "string") {
    const text = moneyChangePercent(value, previous);
    if (text === null) return null;
    const change = compareMoney(value, previous);
    return {
      text,
      tone:
        change === 0
          ? "flat"
          : (lowerIsBetter ? change < 0 : change > 0)
            ? "up"
            : "down",
    };
  }
  if (typeof value !== "number" || typeof previous !== "number") return null;
  const text = deltaText(value, previous, kind, unit);
  if (text === null) return null;
  if (value === previous) return { text, tone: "flat" };
  const improved = lowerIsBetter ? value < previous : value > previous;
  return { text, tone: improved ? "up" : "down" };
}

export function formatCount(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("es-DO");
}

export function formatDays(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("es-DO", { maximumFractionDigits: 1 })} ${value === 1 ? "día" : "días"}`;
}

export function formatRate(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)} %`;
}

/** Axis-sized number: "1,2 M", "350 mil", "80". */
export function compactNumber(value: number): string {
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toLocaleString("es-DO", { maximumFractionDigits: 1 })} M`;
  if (value >= 1_000)
    return `${(value / 1_000).toLocaleString("es-DO", { maximumFractionDigits: 0 })} mil`;
  return value.toLocaleString("es-DO", { maximumFractionDigits: 1 });
}
