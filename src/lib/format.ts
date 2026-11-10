type DateValue = string | Date | number;
const dayMilliseconds = 86_400_000;
const timeZone = "America/Santo_Domingo";
function decimalCents(value: string | number): bigint {
  const decimal = typeof value === "number" ? value.toFixed(2) : value.trim();
  const match = decimal.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new RangeError("El monto no es un decimal válido.");
  const fraction = (match[3] ?? "").padEnd(3, "0");
  const cents =
    BigInt(match[2]) * BigInt(100) +
    BigInt(fraction.slice(0, 2)) +
    BigInt(Number(fraction[2]) >= 5 ? 1 : 0);
  return match[1] ? -cents : cents;
}
function groupedInteger(value: bigint) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
export function formatMoney(value: string | number) {
  const cents = decimalCents(value);
  const absolute = cents < BigInt(0) ? -cents : cents;
  return (
    (cents < BigInt(0) ? "-RD$ " : "RD$ ") +
    groupedInteger(absolute / BigInt(100)) +
    "," +
    (absolute % BigInt(100)).toString().padStart(2, "0")
  );
}
export function formatMoneyShort(value: string | number) {
  const cents = decimalCents(value);
  const absolute = cents < BigInt(0) ? -cents : cents;
  const units = [
    { divisor: BigInt(100_000_000_000), label: "mil M" },
    { divisor: BigInt(100_000_000), label: "M" },
    { divisor: BigInt(100_000), label: "mil" },
  ];
  const unit = units.find((candidate) => absolute >= candidate.divisor);
  if (!unit) return formatMoney(value);
  const tenths =
    (absolute * BigInt(10) + unit.divisor / BigInt(2)) / unit.divisor;
  return (
    (cents < BigInt(0) ? "-RD$ " : "RD$ ") +
    groupedInteger(tenths / BigInt(10)) +
    "," +
    (tenths % BigInt(10)).toString() +
    " " +
    unit.label
  );
}
function dateOf(value: DateValue) {
  const date = new Date(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value + "T12:00:00Z"
      : value,
  );
  if (Number.isNaN(date.getTime()))
    throw new RangeError("La fecha no es válida.");
  return date;
}
export function formatDate(value: DateValue) {
  const parts = new Intl.DateTimeFormat("es-DO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).formatToParts(dateOf(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts
      .find((candidate) => candidate.type === type)
      ?.value.replace(/\.$/, "");
  return part("day") + " " + part("month") + " " + part("year");
}
export function formatDateTime(value: DateValue) {
  const time = new Intl.DateTimeFormat("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(dateOf(value));
  return formatDate(value) + ", " + time;
}
function calendarDay(value: DateValue) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(dateOf(value));
  const numberPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return (
    Date.UTC(numberPart("year"), numberPart("month") - 1, numberPart("day")) /
    dayMilliseconds
  );
}
export function daysUntil(value: DateValue, now: DateValue = new Date()) {
  return calendarDay(value) - calendarDay(now);
}
export function formatRelative(value: DateValue, now: DateValue = new Date()) {
  const seconds = (dateOf(value).getTime() - dateOf(now).getTime()) / 1000;
  const absolute = Math.abs(seconds);
  if (absolute < 60) return "ahora";
  const unit =
    absolute < 3600
      ? { size: 60, label: "min" }
      : absolute < 86400
        ? { size: 3600, label: "h" }
        : null;
  if (unit) {
    const amount = Math.round(absolute / unit.size);
    return seconds < 0
      ? "hace " + amount + " " + unit.label
      : "en " + amount + " " + unit.label;
  }
  const days = Math.round(absolute / 86400);
  return (
    (seconds < 0 ? "hace " : "en ") + days + (days === 1 ? " día" : " días")
  );
}
export { formatCedula, isValidCedula } from "./validation";
export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return value;
  return (
    (digits.length === 11 ? "+1 " : "") +
    "(" +
    local.slice(0, 3) +
    ") " +
    local.slice(3, 6) +
    "-" +
    local.slice(6)
  );
}

export function compareMoney(left: string, right: string) {
  const difference = decimalCents(left) - decimalCents(right);
  return difference < BigInt(0) ? -1 : difference > BigInt(0) ? 1 : 0;
}

export function moneyChangePercent(
  current: string,
  previous: string,
): string | null {
  const prior = decimalCents(previous);
  if (prior === BigInt(0)) return null;
  const difference = decimalCents(current) - prior;
  const absolute = difference < BigInt(0) ? -difference : difference;
  const denominator = prior < BigInt(0) ? -prior : prior;
  const tenths =
    (absolute * BigInt(1000) + denominator / BigInt(2)) / denominator;
  const sign = difference > BigInt(0) ? "+" : difference < BigInt(0) ? "-" : "";
  return (
    sign +
    (tenths / BigInt(10)).toString() +
    "," +
    (tenths % BigInt(10)).toString() +
    " %"
  );
}
