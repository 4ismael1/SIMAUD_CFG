// mantener sincronizado con src/lib/validation/result.ts
export type ValidationResult<T = string> = { ok: true; value: T } | { ok: false; message: string };
export const valid = <T>(value: T): ValidationResult<T> => ({ ok: true, value });
export const invalid = (message: string): ValidationResult<never> => ({ ok: false, message });
