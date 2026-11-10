import type { VariableValues } from '../../../lib/api/core-types';
import { validateIsoDate, validateMoney } from '../../../lib/validation';

/**
 * Template data that the wizard fills by itself, so nothing is asked twice.
 *
 * - Contract-bound: the contract already has start/end dates and a value; templates that print them
 *   use these variable names. The duration in months is computed from the dates.
 * - Client: the person the contract is with. Typing their cédula looks them up and fills the rest.
 *
 * Templates keep using plain {{variables}}; only these well-known names are linked here.
 */

export const CONTRACT_BOUND_VARIABLES = ['fecha_inicio', 'fecha_fin', 'valor_contrato', 'duracion_meses'] as const;
export const CLIENT_VARIABLES = ['cliente_nombre', 'cliente_cedula', 'cliente_email', 'cliente_telefono'] as const;

export type ClientField = 'name' | 'cedula' | 'email' | 'phone';
export const CLIENT_VARIABLE_FOR: Record<ClientField, (typeof CLIENT_VARIABLES)[number]> = {
  name: 'cliente_nombre',
  cedula: 'cliente_cedula',
  email: 'cliente_email',
  phone: 'cliente_telefono',
};

export function isContractBound(name: string): boolean {
  return (CONTRACT_BOUND_VARIABLES as readonly string[]).includes(name);
}

export function isClientVariable(name: string): boolean {
  return (CLIENT_VARIABLES as readonly string[]).includes(name);
}

/** Whole months between two ISO dates (10 nov → 10 dic = 1); at least 1 when the range is valid. */
export function monthsBetween(start: string, end: string): number | null {
  if (!validateIsoDate(start).ok || !validateIsoDate(end).ok || end < start) return null;
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return Math.max(1, months);
}

interface ContractFields {
  startDate: string;
  endDate: string;
  value: string;
}

/** Values the contract already knows, for the bound variable names (empty ones are left out). */
export function contractBoundValues({ startDate, endDate, value }: ContractFields): VariableValues {
  const out: VariableValues = {};
  if (validateIsoDate(startDate).ok) out.fecha_inicio = startDate;
  if (validateIsoDate(endDate).ok) out.fecha_fin = endDate;
  const money = validateMoney(value);
  if (money.ok) out.valor_contrato = money.value;
  const months = monthsBetween(startDate, endDate);
  if (months !== null) out.duracion_meses = months;
  return out;
}

/** What is sent to the API and the preview: what the user typed plus what the wizard filled. */
export function effectiveVariables(draft: ContractFields & { variables: VariableValues }): VariableValues {
  return { ...draft.variables, ...contractBoundValues(draft) };
}
