// mantener sincronizado con api/src/lib/validation/contact.ts
import { valid, invalid, type ValidationResult } from "./result";
export function validatePhoneDo(input: string): ValidationResult {
  if (input.trim().startsWith("+") && !input.trim().startsWith("+1"))
    return invalid("El prefijo internacional del teléfono debe ser +1.");
  if (!/^\+?[\d\s()-]+$/.test(input.trim()))
    return invalid("El teléfono no es válido.");
  let value = input.replace(/[\s()+-]/g, "");
  if (value.length === 11 && value.startsWith("1")) value = value.slice(1);
  if (!/^\d{10}$/.test(value))
    return invalid(
      "El teléfono debe tener 10 dígitos, con prefijo 1 opcional.",
    );
  if (!/^(809|829|849)/.test(value))
    return invalid("El teléfono debe empezar por 809, 829 u 849.");
  return valid(value);
}
export function formatPhoneDo(input: string) {
  const result = validatePhoneDo(input);
  if (!result.ok) return input;
  return (
    result.value.slice(0, 3) +
    "-" +
    result.value.slice(3, 6) +
    "-" +
    result.value.slice(6)
  );
}
export function validateEmail(input: string): ValidationResult {
  const value = input.trim().toLowerCase();
  const parts = value.split("@");
  const local = parts[0] ?? "";
  const domain = parts[1] ?? "";
  const labels = domain.split(".");
  const validLabels = labels.every((label) =>
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  );
  if (
    value.length > 254 ||
    parts.length !== 2 ||
    !/^[^\s@]+$/.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    labels.length < 2 ||
    !validLabels ||
    !/^[a-z]{2,}$/i.test(labels.at(-1) ?? "")
  )
    return invalid(
      "Escribe un correo válido, como nombre@dominio.com (máximo 254 caracteres).",
    );
  return valid(value);
}
export function validatePersonName(
  input: string,
  fullName = true,
): ValidationResult {
  const value = input.normalize("NFC").trim().replace(/\s+/g, " ");
  if (
    value.length < 2 ||
    value.length > 120 ||
    !/^[\p{L} .'’\-]+$/u.test(value)
  )
    return invalid(
      "El nombre debe tener entre 2 y 120 caracteres y solo letras, espacios, apóstrofos, guiones o puntos.",
    );
  const words = value.split(" ").filter((word) => /\p{L}/u.test(word));
  if (words.length < (fullName ? 2 : 1))
    return invalid("Escribe el nombre completo con al menos dos palabras.");
  return valid(value);
}
export function validatePassword(input: string): ValidationResult {
  const weak = new Set([
    "12345678",
    "password1",
    "simaud123",
    "qwerty123",
    "admin123",
    "123456789",
  ]);
  if (
    input.length < 8 ||
    input.length > 128 ||
    !/[a-zA-Z]/.test(input) ||
    !/[0-9]/.test(input)
  )
    return invalid(
      "La contraseña debe tener entre 8 y 128 caracteres e incluir una letra y un número.",
    );
  if (weak.has(input.toLowerCase()))
    return invalid(
      "Esta contraseña es demasiado común. Elige otra más segura.",
    );
  return valid(input);
}
export function validateFreeText(
  input: string,
  minimum = 1,
  maximum = 1000,
): ValidationResult {
  const value = input.trim();
  if (!value || value.length < minimum || value.length > maximum)
    return invalid(
      "El texto debe tener entre " +
        minimum +
        " y " +
        maximum +
        " caracteres y no puede estar vacío.",
    );
  return valid(value);
}
