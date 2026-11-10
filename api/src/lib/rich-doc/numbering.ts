const units = [
  "PRIMERA",
  "SEGUNDA",
  "TERCERA",
  "CUARTA",
  "QUINTA",
  "SEXTA",
  "SÉPTIMA",
  "OCTAVA",
  "NOVENA",
];
const teens = [
  "DÉCIMA",
  "UNDÉCIMA",
  "DUODÉCIMA",
  "DECIMOTERCERA",
  "DECIMOCUARTA",
  "DECIMOQUINTA",
  "DECIMOSEXTA",
  "DECIMOSÉPTIMA",
  "DECIMOCTAVA",
  "DECIMONOVENA",
];
const tens = ["", "", "VIGÉSIMA", "TRIGÉSIMA", "CUADRAGÉSIMA", "QUINCUAGÉSIMA"];

export function clauseNumber(number: number, style: "ordinal" | "decimal"): string {
  if (style === "decimal" || number > 50) return `${number}.`;
  if (number < 10) return units[number - 1] + ".";
  if (number < 20) return teens[number - 10] + ".";
  return tens[Math.floor(number / 10)] + (number % 10 ? " " + units[(number % 10) - 1] : "") + ".";
}
