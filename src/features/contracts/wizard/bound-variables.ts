import type { SignatoryRole, VariableValues } from '../../../lib/api/core-types';
import { formatCedula, validateCedula, validateIsoDate, validateMoney } from '../../../lib/validation';

/**
 * Template data that the wizard fills by itself, so nothing is asked twice.
 *
 * - Contract-bound: the contract already has start/end dates and a value; templates that print them use
 *   these variable names. The duration in months is computed from the dates.
 * - People: the signatories ARE the people of the contract. Each signatory is added once (by cédula, in
 *   «Firmantes»), and their name, cédula, email and phone fill the variables of their role: the first
 *   signatory with role «Cliente» fills cliente_*, the first «Por la institución» fills representante_*.
 *   Anything that cannot be deduced (e.g. representante_cargo) is still asked in «Datos».
 *
 * Templates keep using plain {{variables}}; only these well-known names are linked here.
 */

export const CONTRACT_BOUND_VARIABLES = ['fecha_inicio', 'fecha_fin', 'valor_contrato', 'duracion_meses'] as const;

export type PartyField = 'name' | 'cedula' | 'email' | 'phone';

export interface PartyConfig {
  /** Shown in messages: «Añade un firmante con rol …». */
  label: string;
  role: SignatoryRole;
  fields: Record<PartyField, string>;
}

export const PARTIES: PartyConfig[] = [
  {
    label: 'Cliente',
    role: 'client',
    fields: { name: 'cliente_nombre', cedula: 'cliente_cedula', email: 'cliente_email', phone: 'cliente_telefono' },
  },
  {
    label: 'Por la institución',
    role: 'contractor',
    fields: { name: 'representante_nombre', cedula: 'representante_cedula', email: 'representante_email', phone: 'representante_telefono' },
  },
];

const PARTY_VARIABLES = new Map(PARTIES.flatMap((party) => Object.values(party.fields).map((name) => [name, party] as const)));

export function isContractBound(name: string): boolean {
  return (CONTRACT_BOUND_VARIABLES as readonly string[]).includes(name);
}

/** True for variables filled from a signatory (they are not asked in «Datos»). */
export function isPartyVariable(name: string): boolean {
  return PARTY_VARIABLES.has(name);
}

/** The party (role) a variable comes from, if any. */
export function partyOf(name: string): PartyConfig | undefined {
  return PARTY_VARIABLES.get(name);
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

interface SignatoryData {
  role: SignatoryRole;
  name: string;
  cedula: string;
  email: string;
  phone: string;
}

/** Name, cédula, email and phone of the first signatory of each role, for that role's variables. */
export function partyValues(signatories: SignatoryData[]): VariableValues {
  const out: VariableValues = {};
  for (const party of PARTIES) {
    const person = signatories.find((signatory) => signatory.role === party.role);
    if (!person) continue;
    const cedula = validateCedula(person.cedula);
    const values: Record<PartyField, string> = {
      name: person.name.trim().replace(/\s+/g, ' '),
      cedula: cedula.ok ? formatCedula(cedula.value) : person.cedula.trim(),
      email: person.email.trim(),
      phone: person.phone.trim(),
    };
    for (const field of Object.keys(party.fields) as PartyField[]) {
      if (values[field]) out[party.fields[field]] = values[field];
    }
  }
  return out;
}

/**
 * What is sent to the API and the preview: what the user typed plus what the wizard filled, limited to
 * the variables the template actually uses (the API rejects unknown ones, e.g. a representative's email
 * when the template only prints their name).
 */
export function effectiveVariables(
  draft: ContractFields & { variables: VariableValues; signatories: SignatoryData[] },
  templateVariables?: Iterable<string>,
): VariableValues {
  const all: VariableValues = { ...draft.variables, ...partyValues(draft.signatories), ...contractBoundValues(draft) };
  if (!templateVariables) return all;
  const allowed = new Set(templateVariables);
  return Object.fromEntries(Object.entries(all).filter(([name]) => allowed.has(name)));
}

/** Roles the document needs a signatory for, in the order the template first mentions them. */
export function rolesNeeded(variables: { name: string }[]): SignatoryRole[] {
  const roles: SignatoryRole[] = [];
  for (const variable of variables) {
    const party = partyOf(variable.name);
    if (party && !roles.includes(party.role)) roles.push(party.role);
  }
  return roles;
}

interface SignatoryCard extends SignatoryData {
  linkedUserId?: string | null;
}

/**
 * One card per person the document names, ready to fill: a role already present is kept, an empty card is
 * reused for a missing role, otherwise a new card is added. Cards the user filled are never changed.
 */
export function withNeededSignatories<T extends SignatoryCard>(signatories: T[], roles: SignatoryRole[], create: (role: SignatoryRole) => T): T[] {
  const next = [...signatories];
  const isEmpty = (card: T) => !card.name.trim() && !card.cedula.trim() && !card.email.trim();
  for (const role of roles) {
    if (next.some((card) => card.role === role)) continue;
    // An empty card can take this role if its own role is not needed, or is needed but repeated.
    const reusable = (card: T) =>
      isEmpty(card) && (!roles.includes(card.role) || next.filter((other) => other.role === card.role).length > 1);
    const emptyIndex = next.findIndex(reusable);
    if (emptyIndex >= 0) next[emptyIndex] = { ...next[emptyIndex], role };
    else next.push(create(role));
  }
  return next;
}
