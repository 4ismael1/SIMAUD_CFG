// mantener sincronizado con src/lib/validation/identity.ts
import { CEDULA_EXCEPTIONS } from "./cedula-exceptions.js";
import { valid, invalid, type ValidationResult } from "./result.js";
export function validateCedula(input: string): ValidationResult {
  const value = input.trim().replace(/\s/g, "");
  if (!/^(?:\d{11}|\d{3}-\d{7}-\d)$/.test(value))
    return invalid("La cédula debe tener 11 dígitos, con o sin guiones.");
  const digits = value.replace(/-/g, "");
  if (/^(\d)\1{10}$/.test(digits))
    return invalid("La cédula no puede tener todos los dígitos iguales.");
  if (CEDULA_EXCEPTIONS.has(digits)) return valid(digits);
  const sum = [...digits.slice(0, 10)].reduce((total, digit, index) => {
    const product = Number(digit) * (index % 2 === 0 ? 1 : 2);
    return total + (product >= 10 ? product - 9 : product);
  }, 0);
  return (10 - (sum % 10)) % 10 === Number(digits[10])
    ? valid(digits)
    : invalid("La cédula no es válida: revisa el dígito verificador.");
}
export function validateRnc(input: string): ValidationResult {
  const value = input.trim();
  if (!/^(?:\d{9}|\d-\d{2}-\d{5}-\d)$/.test(value))
    return invalid("El RNC debe tener 9 dígitos, con o sin guiones.");
  const digits = value.replace(/-/g, "");
  const weights = [7, 9, 8, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + weight * Number(digits[index]), 0);
  const remainder = sum % 11;
  const check = remainder === 0 ? 2 : remainder === 1 ? 1 : 11 - remainder;
  return check === Number(digits[8])
    ? valid(digits)
    : invalid("El RNC no es válido: revisa el dígito verificador.");
}
export function validateTaxId(
  input: string,
): ValidationResult<{ type: "cedula" | "rnc"; value: string }> {
  const type = input.replace(/[\s-]/g, "").length === 9 ? "rnc" : "cedula";
  const result = type === "rnc" ? validateRnc(input) : validateCedula(input);
  return result.ok ? valid({ type, value: result.value }) : result;
}
export const isValidCedula = (input: string) => validateCedula(input).ok;
export function formatCedula(input: string) {
  const result = validateCedula(input);
  if (!result.ok) return input;
  const value = result.value;
  return value.slice(0, 3) + "-" + value.slice(3, 10) + "-" + value.slice(10);
}
