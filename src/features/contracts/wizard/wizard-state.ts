import type { ContractDetail, ContractInput } from '../../../lib/api/contract-types';
import type { SignatoryRole, VariableValues } from '../../../lib/api/core-types';
import type { TemplateSignatureSlot, Variable } from '../../../lib/api/catalog-types';
import {
  validateCedula,
  validateDateRange,
  validateEmail,
  validateIsoDate,
  validateMoney,
  validatePersonName,
  validatePhoneDo,
} from '../../../lib/validation';
import { effectiveVariables, isContractBound, isPartyVariable, partyOf } from './bound-variables';

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
  /** T19: the template box (role) this person signs; null = witness, or a template without boxes. */
  slotIndex: number | null;
  /** T19: the role shown on the card (box label or «Testigo»); empty without boxes. */
  roleLabel: string;
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
  return { key: newKey(), name: '', cedula: '', email: '', phone: '', role, group, linkedUserId: null, slotIndex: null, roleLabel: '' };
}

export const WITNESS_LABEL = 'Testigo';

export function emptyWitness(group = 1): SignatoryDraft {
  return { ...emptySignatory('witness', group), roleLabel: WITNESS_LABEL };
}

/** Templates with signature boxes: one person per box (role), plus optional witnesses. */
export function usesTemplateSlots(slots: TemplateSignatureSlot[] | undefined): slots is TemplateSignatureSlot[] {
  return Boolean(slots && slots.length > 0);
}

/**
 * One card per box of the template, in box order, then the witnesses. Cards already tied to a box keep
 * their data; untied cards with data fill free boxes in order; leftovers with data stay as witnesses.
 */
export function withTemplateSlots(signatories: SignatoryDraft[], slots: TemplateSignatureSlot[]): SignatoryDraft[] {
  const filled = (card: SignatoryDraft) => [card.name, card.cedula, card.email, card.phone].some((value) => value.trim() !== '');
  const byBox = new Map<number, SignatoryDraft>();
  for (const card of signatories) {
    if (card.slotIndex !== null && card.slotIndex < slots.length && !byBox.has(card.slotIndex)) byBox.set(card.slotIndex, card);
  }
  const loose = signatories.filter((card) => !byBox.has(card.slotIndex ?? -1) || byBox.get(card.slotIndex ?? -1) !== card);
  const witnesses = loose.filter((card) => card.role === 'witness' && card.slotIndex === null);
  const movable = loose.filter((card) => !witnesses.includes(card) && filled(card));

  const boxes = slots.map((slot) => {
    const card = byBox.get(slot.index) ?? movable.shift() ?? emptySignatory('contractor', slot.index + 1);
    return { ...card, slotIndex: slot.index, roleLabel: slot.label, role: card.role === 'witness' ? 'contractor' : card.role };
  });
  const extra = [...witnesses, ...movable].map((card) => ({ ...card, slotIndex: null, role: 'witness' as const, roleLabel: WITNESS_LABEL }));
  return [...boxes, ...extra];
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
      slotIndex: signatory.slotIndex ?? null,
      roleLabel: signatory.roleLabel ?? '',
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

  const values = effectiveVariables(draft);
  for (const variable of variables) {
    // Filled from the contract fields above, or from the signatories (checked in that step).
    if (isContractBound(variable.name) || isPartyVariable(variable.name)) continue;
    const raw = values[variable.name];
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

export function validateSignatoriesStep(draft: WizardDraft, variables: Variable[] = [], slots?: TemplateSignatureSlot[]): FieldErrors {
  const errors: FieldErrors = {};
  const boxed = usesTemplateSlots(slots);
  if (boxed) {
    const missing = slots.filter((slot) => !draft.signatories.some((signatory) => signatory.slotIndex === slot.index));
    if (missing.length > 0) errors.signatories = `Falta la persona de: ${missing.map((slot) => slot.label).join(', ')}.`;
  }
  // The document needs this person's data: there must be a signatory with that role.
  const missingRoles = new Set<string>();
  for (const variable of boxed ? [] : variables) {
    const party = partyOf(variable.name);
    if (party && variable.required && !draft.signatories.some((signatory) => signatory.role === party.role)) missingRoles.add(party.label);
  }
  if (missingRoles.size > 0) {
    errors.signatories = `El documento necesita los datos de: ${[...missingRoles].join(' y ')}. Añade un firmante con ese rol.`;
  }
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

    // The cédula is the signer's legal identity: always required on a contract.
    if (!signatory.cedula.trim()) {
      errors[`${prefix}cedula`] = 'La cédula es obligatoria.';
    } else {
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

/** Builds the API payload; assumes the steps were validated. `templateVariables`: names the template uses. */
export function toContractInput(draft: WizardDraft, templateVariables?: Iterable<string>, slots?: TemplateSignatureSlot[]): ContractInput {
  const boxed = usesTemplateSlots(slots);
  const money = validateMoney(draft.value);
  return {
    templateId: draft.templateId,
    title: draft.title.trim(),
    variables: effectiveVariables(draft, templateVariables),
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
        // With template boxes the server derives the role from the box; only witnesses say theirs.
        ...(boxed
          ? signatory.slotIndex !== null
            ? { slotIndex: signatory.slotIndex }
            : { slotIndex: null, role: 'witness' as const }
          : { role: signatory.role }),
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
