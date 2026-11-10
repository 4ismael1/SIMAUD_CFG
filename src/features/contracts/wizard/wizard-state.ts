import type { ContractDetail, ContractInput } from '../../../lib/api/contract-types';
import type { SignatoryRole, VariableValues } from '../../../lib/api/core-types';
import type { Variable } from '../../../lib/api/catalog-types';
import {
  validateCedula,
  validateDateRange,
  validateEmail,
  validateIsoDate,
  validateMoney,
  validatePersonName,
  validatePhoneDo,
} from '../../../lib/validation';

export const WIZARD_STEPS = [
  { id: 'template', label: 'Plantilla' },
  { id: 'details', label: 'Datos' },
  { id: 'signatories', label: 'Firmantes' },
  { id: 'review', label: 'Revisar' },
] as const;

export type StepId = (typeof WIZARD_STEPS)[number]['id'];

/** How the signatories take turns. "groups" lets several people share a step and sign at the same time. */
export type SigningMode = 'sequential' | 'parallel' | 'groups';

export const MAX_SIGNATORIES = 100;

export interface SignatoryDraft {
  /** Local key for React lists; never sent to the API. */
  key: string;
  name: string;
  cedula: string;
  email: string;
  phone: string;
  role: SignatoryRole;
  /** Only used in "groups" mode; sequential/parallel derive the order from the list position. */
  group: number;
  /** Filled when the cédula matched a registered user. */
  linkedUserId: string | null;
}

export interface WizardDraft {
  templateId: string;
  title: string;
  variables: VariableValues;
  value: string;
  startDate: string;
  endDate: string;
  notes: string;
  signingMode: SigningMode;
  signatories: SignatoryDraft[];
}

export type FieldErrors = Record<string, string>;

let keyCounter = 0;
export function newKey() {
  keyCounter += 1;
  return `s${Date.now().toString(36)}${keyCounter}`;
}

export function emptySignatory(role: SignatoryRole = 'client', group = 1): SignatoryDraft {
  return { key: newKey(), name: '', cedula: '', email: '', phone: '', role, group, linkedUserId: null };
}

export function emptyDraft(): WizardDraft {
  return {
    templateId: '',
    title: '',
    variables: {},
    value: '',
    startDate: '',
    endDate: '',
    notes: '',
    signingMode: 'sequential',
    signatories: [emptySignatory('client', 1)],
  };
}

/** Signing order sent to the API for the signatory at `index`. */
export function signingOrderFor(draft: WizardDraft, index: number): number {
  if (draft.signingMode === 'parallel') return 1;
  if (draft.signingMode === 'groups') return draft.signatories[index].group;
  return index + 1;
}

/** Rebuilds the wizard state from an existing contract (edit mode). */
export function draftFromContract(contract: ContractDetail): WizardDraft {
  const orders = contract.signatories.map((signatory) => signatory.signingOrder);
  const distinct = new Set(orders);
  const isSequential = orders.every((order, index) => order === index + 1);
  const signingMode: SigningMode = distinct.size === 1 && orders.length > 1 ? 'parallel' : isSequential ? 'sequential' : 'groups';

  return {
    templateId: contract.templateId ?? '',
    title: contract.title,
    variables: contract.variablesData ?? {},
    value: contract.contractValue ?? '',
    startDate: contract.startDate ?? '',
    endDate: contract.endDate ?? '',
    notes: contract.notes ?? '',
    signingMode,
    signatories: contract.signatories.map((signatory) => ({
      key: newKey(),
      name: signatory.name,
      cedula: signatory.cedula ?? '',
      email: signatory.email,
      phone: signatory.phone ?? '',
      role: signatory.role,
      group: signatory.signingOrder,
      linkedUserId: signatory.userId,
    })),
  };
}

export function validateTemplateStep(draft: WizardDraft): FieldErrors {
  return draft.templateId ? {} : { templateId: 'Elige una plantilla para continuar.' };
}

export function validateDetailsStep(draft: WizardDraft, variables: Variable[]): FieldErrors {
  const errors: FieldErrors = {};

  if (draft.title.trim().length < 3) errors.title = 'Escribe un título de al menos 3 caracteres.';

  const money = validateMoney(draft.value);
  if (!money.ok) errors.value = money.message;

  const start = validateIsoDate(draft.startDate);
  const end = validateIsoDate(draft.endDate);
  if (!start.ok) errors.startDate = 'Indica la fecha de inicio.';
  if (!end.ok) errors.endDate = 'Indica la fecha de fin.';
  if (start.ok && end.ok) {
    const range = validateDateRange(draft.startDate, draft.endDate);
    if (!range.ok) errors.endDate = range.message;
  }

  for (const variable of variables) {
    const raw = draft.variables[variable.name];
    const text = raw === null || raw === undefined ? '' : String(raw).trim();
    if (variable.required && text === '') {
      errors[`var:${variable.name}`] = `«${variable.label}» es obligatorio.`;
      continue;
    }
    if (text === '') continue;
    if (variable.type === 'number' && !Number.isFinite(Number(text.replace(',', '.')))) {
      errors[`var:${variable.name}`] = 'Escribe un número válido.';
    }
    if (variable.type === 'date' && !validateIsoDate(text).ok) {
      errors[`var:${variable.name}`] = 'Escribe una fecha válida.';
    }
    if (variable.type === 'select' && variable.options && !variable.options.includes(text)) {
      errors[`var:${variable.name}`] = 'Elige una de las opciones.';
    }
  }
  return errors;
}

export function validateSignatoriesStep(draft: WizardDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.signatories.length === 0) errors.signatories = 'Agrega al menos un firmante.';
  if (draft.signatories.length > MAX_SIGNATORIES) errors.signatories = `Máximo ${MAX_SIGNATORIES} firmantes por contrato.`;

  const seenEmails = new Map<string, number>();
  const seenCedulas = new Map<string, number>();

  draft.signatories.forEach((signatory, index) => {
    const prefix = `sig:${signatory.key}:`;

    const name = validatePersonName(signatory.name);
    if (!name.ok) errors[`${prefix}name`] = name.message;

    const email = validateEmail(signatory.email);
    if (!email.ok) {
      errors[`${prefix}email`] = email.message;
    } else if (seenEmails.has(email.value)) {
      errors[`${prefix}email`] = `Este correo ya está en el firmante ${(seenEmails.get(email.value) ?? 0) + 1}.`;
    } else {
      seenEmails.set(email.value, index);
    }

    if (signatory.cedula.trim()) {
      const cedula = validateCedula(signatory.cedula);
      if (!cedula.ok) {
        errors[`${prefix}cedula`] = cedula.message;
      } else if (seenCedulas.has(cedula.value)) {
        errors[`${prefix}cedula`] = `Esta cédula ya está en el firmante ${(seenCedulas.get(cedula.value) ?? 0) + 1}.`;
      } else {
        seenCedulas.set(cedula.value, index);
      }
    }

    if (signatory.phone.trim()) {
      const phone = validatePhoneDo(signatory.phone);
      if (!phone.ok) errors[`${prefix}phone`] = phone.message;
    }

    if (draft.signingMode === 'groups' && (!Number.isInteger(signatory.group) || signatory.group < 1)) {
      errors[`${prefix}group`] = 'Paso inválido.';
    }
  });
  return errors;
}

/** Builds the API payload; assumes the steps were validated. */
export function toContractInput(draft: WizardDraft): ContractInput {
  const money = validateMoney(draft.value);
  return {
    templateId: draft.templateId,
    title: draft.title.trim(),
    variables: draft.variables,
    value: money.ok ? money.value : draft.value,
    startDate: draft.startDate,
    endDate: draft.endDate,
    notes: draft.notes.trim() || null,
    signatories: draft.signatories.map((signatory, index) => {
      const cedula = validateCedula(signatory.cedula);
      const phone = validatePhoneDo(signatory.phone);
      const email = validateEmail(signatory.email);
      return {
        name: signatory.name.trim().replace(/\s+/g, ' '),
        email: email.ok ? email.value : signatory.email.trim(),
        cedula: signatory.cedula.trim() ? (cedula.ok ? cedula.value : signatory.cedula) : undefined,
        phone: signatory.phone.trim() ? (phone.ok ? phone.value : signatory.phone) : undefined,
        role: signatory.role,
        signingOrder: signingOrderFor(draft, index),
      };
    }),
  };
}

/**
 * Whether the user actually wrote something worth recovering. Only choosing a template, or visiting
 * the wizard, is not a draft: it must not be autosaved nor announced as «borrador» later.
 */
export function hasDraftContent(draft: WizardDraft): boolean {
  const filled = (value: string | undefined) => Boolean(value && value.trim());
  return (
    filled(draft.title) ||
    filled(draft.value) ||
    filled(draft.startDate) ||
    filled(draft.endDate) ||
    filled(draft.notes) ||
    Object.values(draft.variables ?? {}).some((value) => value !== null && value !== undefined && String(value).trim() !== '') ||
    draft.signatories.some((signatory) => filled(signatory.name) || filled(signatory.cedula) || filled(signatory.email) || filled(signatory.phone))
  );
}
