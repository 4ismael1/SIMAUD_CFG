import { formatCedula } from "./validation/format-cedula.js";
import { validateIsoDate } from "./validation/index.js";
import { ApiError } from "./errors.js";
export interface Variable {
  name: string;
  type: string;
  required?: boolean;
  options?: string[] | null;
  implicit?: boolean;
}
export const extractVariables = (content: string) => [
  ...new Set([...content.matchAll(/{{\s*([a-z][a-z0-9_]*)\s*}}/g)].map((m) => m[1]!)),
];
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export function renderTemplate(
  content: string,
  values: Record<string, unknown>,
  variables: Variable[] = [],
) {
  const missing: string[] = [];
  const html = escapeHtml(content).replace(/{{\s*([a-z][a-z0-9_]*)\s*}}/g, (_, name: string) => {
    const value = values[name];
    const def = variables.find((v) => v.name === name);
    if (value === undefined || value === null || value === "") {
      missing.push(name);
      return "{{" + name + "}}";
    }
    return escapeHtml(formatVariable(value, def, name));
  });
  return { html, missing: [...new Set(missing)] };
}

export function formatVariable(value: unknown, def: Variable | undefined, name: string) {
  let formatted: string;
  if (def?.type === "cedula" || name === "cliente_cedula") {
    formatted = formatCedula(String(value));
  } else if (def?.type === "money" || def?.name === "valor_contrato") {
    const [integer, fraction = "00"] = String(value).split(".");
    formatted =
      "RD$ " + integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + fraction.padEnd(2, "0");
  } else if (def?.type === "number") {
    // A plain number (months, days, percentages…): never shown as money.
    const n = Number(value);
    if (!Number.isFinite(n))
      throw new ApiError(400, "VALIDATION_ERROR", "Número inválido.", { field: name });
    formatted = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
  } else if (def?.type === "date") {
    const result = validateIsoDate(String(value));
    if (!result.ok)
      throw new ApiError(400, "VALIDATION_ERROR", result.message, [
        { field: name, message: result.message },
      ]);
    const date = new Date(result.value + "T00:00:00Z");
    formatted = new Intl.DateTimeFormat("es-DO", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  } else {
    formatted = String(value);
    if (def?.type === "select" && !def.options?.includes(formatted))
      throw new ApiError(400, "VALIDATION_ERROR", "Opción inválida.", { field: name });
  }
  return formatted;
}
