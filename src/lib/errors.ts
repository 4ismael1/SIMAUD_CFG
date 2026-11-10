import { ApiError } from './api/client';

const GENERIC_MESSAGE = 'No se pudo completar la acción. Inténtalo de nuevo.';

/** User-facing message for any thrown value. */
export function errorMessage(error: unknown, fallback = GENERIC_MESSAGE): string {
  if (error instanceof ApiError) return error.message || fallback;
  return fallback;
}

/** Name of the field the API flagged (409 CONFLICT / 400 VALIDATION_ERROR with details.field). */
export function errorField(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const details = error.details;
  if (details && typeof details === 'object' && 'field' in details && typeof details.field === 'string') {
    return details.field;
  }
  return null;
}

export function isApiError(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}
