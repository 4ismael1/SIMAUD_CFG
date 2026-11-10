// mantener sincronizado con api/src/lib/validation/money-date.ts
import { valid, invalid, type ValidationResult } from "./result";
function decimalParts(input: string): [string, string] | null {
  const value = input.trim();
  if (/^\d+(?:[.,]\d{1,2})?$/.test(value)) {
    const [integer, fraction = ""] = value.split(/[.,]/);
    return [integer!, fraction];
  }
  // Un separador seguido de tres cifras se interpreta como agrupación de miles.
  for (const [group, decimal] of [
    [",", "."],
    [".", ","],
  ]) {
    const escapedGroup = group === "." ? "\\." : ",";
    const escapedDecimal = decimal === "." ? "\\." : ",";
    const pattern = new RegExp(
      "^\\d{1,3}(?:" +
        escapedGroup +
        "\\d{3})+(?:" +
        escapedDecimal +
        "\\d{1,2})?$",
    );
    if (!pattern.test(value)) continue;
    const [integer, fraction = ""] = value.split(decimal!);
    return [integer!.split(group!).join(""), fraction];
  }
  return null;
}
export function validateMoney(input: string): ValidationResult {
  const parts = decimalParts(input);
  if (!parts)
    return invalid(
      "Escribe un monto decimal válido con un máximo de dos decimales.",
    );
  const [integer, fraction] = parts;
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
  if (normalizedInteger.length > 12)
    return invalid("El monto no puede superar 999 999 999 999,99.");
  const cents =
    BigInt(normalizedInteger) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  if (cents <= BigInt(0)) return invalid("El monto debe ser mayor que cero.");
  return valid(normalizedInteger + "." + fraction.padEnd(2, "0"));
}
export function validateIsoDate(input: string): ValidationResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || input.startsWith("0000"))
    return invalid("La fecha debe ser válida y tener formato AAAA-MM-DD.");
  const date = new Date(input + "T00:00:00Z");
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === input
    ? valid(input)
    : invalid("La fecha no existe en el calendario.");
}
export function isAfter(date: string, reference: string): boolean {
  return (
    validateIsoDate(date).ok &&
    validateIsoDate(reference).ok &&
    date > reference
  );
}
export function validateDateRange(
  start: string,
  end: string,
): ValidationResult<{ start: string; end: string }> {
  const startResult = validateIsoDate(start);
  if (!startResult.ok) return startResult;
  const endResult = validateIsoDate(end);
  if (!endResult.ok) return endResult;
  return isAfter(end, start)
    ? valid({ start, end })
    : invalid("La fecha final debe ser posterior al inicio.");
}
