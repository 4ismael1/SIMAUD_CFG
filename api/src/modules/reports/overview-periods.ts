import { invalid } from "../contracts/service.js";
import type { DateRange, OverviewQuery } from "./overview-schema.js";

const dayMilliseconds = 86400000;
const monthNames = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
export const dateKey = (date: Date) => date.toISOString().slice(0, 10);
export const dateOf = (date: string) => new Date(date + "T00:00:00Z");
export const shiftDays = (date: string, days: number) =>
  dateKey(new Date(dateOf(date).getTime() + days * dayMilliseconds));

function localToday(now: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join("-");
}

export function overviewRanges(query: Pick<OverviewQuery, "from" | "to">, now = new Date()) {
  const today = localToday(now);
  const range = { from: query.from ?? shiftDays(query.to ?? today, -89), to: query.to ?? today };
  if (range.from > range.to) throw invalid("Rango de fechas inválido.");
  const days = (dateOf(range.to).getTime() - dateOf(range.from).getTime()) / dayMilliseconds + 1;
  const previousRange = { from: shiftDays(range.from, -days), to: shiftDays(range.from, -1) };
  if (previousRange.from.length !== 10)
    throw invalid("Rango de fechas fuera de los límites admitidos.");
  return { range, previousRange };
}

function isoWeek(date: Date) {
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / dayMilliseconds + 1) / 7);
  return { year, week };
}

export function periodInfo(day: string, granularity: OverviewQuery["granularity"]) {
  const date = dateOf(day);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (granularity === "year") return { period: String(year), label: String(year) };
  if (granularity === "quarter") {
    const quarter = Math.floor(month / 3) + 1;
    return { period: `${year}-Q${quarter}`, label: `T${quarter} ${year}` };
  }
  if (granularity === "week") {
    const week = isoWeek(date);
    return {
      period: `${week.year}-W${String(week.week).padStart(2, "0")}`,
      label: `Sem ${week.week}`,
    };
  }
  return { period: day.slice(0, 7), label: `${monthNames[month]} ${year}` };
}

export function periods(range: DateRange, granularity: OverviewQuery["granularity"]) {
  const result: Array<DateRange & { period: string; label: string }> = [];
  let from = range.from;
  while (from <= range.to) {
    const info = periodInfo(from, granularity);
    const next = dateOf(from);
    if (granularity === "week") next.setUTCDate(next.getUTCDate() + 8 - (next.getUTCDay() || 7));
    if (granularity === "month") next.setUTCMonth(next.getUTCMonth() + 1, 1);
    if (granularity === "quarter") next.setUTCMonth(Math.floor(next.getUTCMonth() / 3) * 3 + 3, 1);
    if (granularity === "year") next.setUTCFullYear(next.getUTCFullYear() + 1, 0, 1);
    if (next > dateOf(range.to)) {
      result.push({ ...info, from, to: range.to });
      break;
    }
    const to = shiftDays(dateKey(next), -1);
    result.push({ ...info, from, to });
    from = dateKey(next);
  }
  return result;
}

type TimelineTotals = { day: string; created: number; activated: number; value: number };

export function comparedTimeline(
  range: DateRange,
  previousRange: DateRange,
  granularity: OverviewQuery["granularity"],
  current: TimelineTotals[],
  previous: TimelineTotals[],
) {
  const currentPoints = new Map(
    current.map((row) => [periodInfo(row.day, granularity).period, row]),
  );
  const previousPoints = new Map(
    previous.map((row) => [periodInfo(row.day, granularity).period, row]),
  );
  const previousPeriods = periods(previousRange, granularity);
  return periods(range, granularity).map(({ period, label }, index) => {
    const point = currentPoints.get(period);
    const previousPeriod = previousPeriods[index];
    const prior = previousPeriod && previousPoints.get(previousPeriod.period);
    return {
      period,
      label,
      created: point?.created ?? 0,
      activated: point?.activated ?? 0,
      value: point?.value ?? 0,
      previousCreated: previousPeriod ? (prior?.created ?? 0) : null,
      previousValue: previousPeriod ? (prior?.value ?? 0) : null,
    };
  });
}
