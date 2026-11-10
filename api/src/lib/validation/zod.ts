import { z } from "zod";
import {
  validateCedula,
  validateRnc,
  validateTaxId,
  validatePhoneDo,
  validateEmail,
  validatePersonName,
  validatePassword,
  validateMoney,
  validateIsoDate,
  validateFreeText,
  type ValidationResult,
} from "./index.js";
export function validated<T>(validator: (input: string) => ValidationResult<T>) {
  return z.string({ error: "Escribe un texto válido." }).transform((input, context) => {
    const result = validator(input);
    if (result.ok) return result.value;
    context.addIssue({ code: "custom", message: result.message });
    return z.NEVER;
  });
}
export const zCedula = validated(validateCedula);
export const zRnc = validated(validateRnc);
export const zTaxId = validated(validateTaxId).transform((document) => document.value);
export const zPhoneDo = validated(validatePhoneDo);
export const zEmail = validated(validateEmail);
export const zPersonName = validated(validatePersonName);
export const zPassword = validated(validatePassword);
export const zMoney = validated(validateMoney);
// Compatibilidad con clientes existentes: el cálculo decimal siempre se hace sobre strings.
export const zMoneyInput = z
  .union([z.string(), z.number().finite()])
  .transform(String)
  .pipe(zMoney);
export const zIsoDate = validated(validateIsoDate);
export const zFreeText = (minimum = 1, maximum = 1000) =>
  validated((input) => validateFreeText(input, minimum, maximum));
