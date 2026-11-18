import { ApiError } from './api/client';

const GENERIC_MESSAGE = 'No se pudo completar la acción. Inténtalo de nuevo.';

/** User-facing message for any thrown value. */
export function errorMessage(error: unknown, fallback = GENERIC_MESSAGE): string {
  if (error instanceof ApiError) return error.message || fallback;
  return fallback;
}

type FieldIssue = { field: string; message?: string };
const isFieldIssue = (value: unknown): value is FieldIssue =>
  !!value && typeof value === 'object' && 'field' in value && typeof value.field === 'string' && value.field !== '';

/**
 * Fields the API flagged, with their messages: `details` is one `{field, message?}` (409 CONFLICT)
 * or a list of them (400 VALIDATION_ERROR from the request schema).
 */
export function errorFields(error: unknown): FieldIssue[] {
  if (!(error instanceof ApiError)) return [];
  const details = error.details;
  return (Array.isArray(details) ? details : [details]).filter(isFieldIssue);
}

/** Name of the (first) field the API flagged. */
export function errorField(error: unknown): string | null {
  return errorFields(error)[0]?.field ?? null;
}

export function isApiError(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}
