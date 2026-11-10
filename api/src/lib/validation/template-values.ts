import { ApiError } from "../errors.js";
import {
  validateCedula,
  validateTaxId,
  validatePhoneDo,
  validateEmail,
  validateMoney,
  validateIsoDate,
  type ValidationResult,
} from "./index.js";
interface Definition {
  name: string;
  type: string;
}
const validators: Record<string, (value: string) => ValidationResult> = {
  cedula: validateCedula,
  phone: validatePhoneDo,
  email: validateEmail,
  money: validateMoney,
  date: validateIsoDate,
};
// El catálogo legado guarda estos campos del cliente como texto o número.
const clientTypes: Record<string, string> = {
  cliente_email: "email",
  cliente_telefono: "phone",
  valor_contrato: "money",
};
export function normalizeTemplateValues(
  values: Record<string, unknown>,
  definitions: Definition[],
) {
  const normalized = { ...values };
  for (const definition of definitions) {
    const value = values[definition.name];
    if (value === undefined || value === null || value === "") continue;
    const type = clientTypes[definition.name] ?? definition.type;
    const validator = validators[type];
    const result =
      definition.name === "cliente_cedula"
        ? validateTaxId(String(value))
        : validator?.(String(value));
    if (!result) continue;
    if (!result.ok)
      throw new ApiError(400, "VALIDATION_ERROR", "Los datos enviados no son válidos.", [
        { field: "variables." + definition.name, message: result.message },
      ]);
    normalized[definition.name] =
      typeof result.value === "string" ? result.value : result.value.value;
  }
  return normalized;
}
