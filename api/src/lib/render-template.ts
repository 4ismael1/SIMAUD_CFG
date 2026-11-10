import { ApiError } from "./errors.js";
export interface Variable {
  name: string;
  type: string;
  required?: boolean;
  options?: string[] | null;
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
    let formatted: string;
    if (def?.type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n))
        throw new ApiError(400, "VALIDATION_ERROR", "Número inválido.", { field: name });
      formatted =
        "RD$ " +
        new Intl.NumberFormat("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);
    } else if (def?.type === "date") {
      const s = String(value);
      const date = new Date(s + "T00:00:00Z");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== s
      )
        throw new ApiError(400, "VALIDATION_ERROR", "Fecha inválida.", { field: name });
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
    return escapeHtml(formatted);
  });
  return { html, missing: [...new Set(missing)] };
}
