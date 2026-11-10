import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ArrowDown, ArrowUp, ArrowRight, Copy, GripVertical, Plus, Trash2, UserCheck, Users } from 'lucide-react';
import { Alert, Badge, Button, Field, IconButton, Input, Segmented, Select, cn, useToast } from '../../../ui';
import { useUserLookup } from '../../../lib/api/hooks/users';
import type { SignatoryRole } from '../../../lib/api/core-types';
import { formatCedula, validateCedula } from '../../../lib/validation';
import { SIGNATORY_ROLE_LABELS } from '../components/SignatoriesPanel';
import {
  MAX_SIGNATORIES,
  emptySignatory,
  newKey,
  signingOrderFor,
  type FieldErrors,
  type SignatoryDraft,
  type SigningMode,
  type WizardDraft,
} from './wizard-state';

interface StepSignatoriesProps {
  draft: WizardDraft;
  errors: FieldErrors;
  onChange: (patch: Partial<WizardDraft>) => void;
}

const MODE_HELP: Record<SigningMode, string> = {
  sequential: 'Cada persona firma cuando la anterior haya firmado, en el orden de la lista.',
  parallel: 'Todas las personas pueden firmar al mismo tiempo, sin esperar a nadie.',
  groups: 'Asigna un paso a cada persona: quienes comparten paso firman a la vez y el siguiente paso espera.',
};

const ROLE_OPTIONS: SignatoryRole[] = ['client', 'contractor', 'witness'];

export function StepSignatories({ draft, errors, onChange }: StepSignatoriesProps) {
  const { signatories, signingMode } = draft;
  const atLimit = signatories.length >= MAX_SIGNATORIES;
  const listRef = useRef<HTMLOListElement>(null);
  const toast = useToast();
  // Undo runs later, against whatever the list looks like by then.
  const latestSignatories = useRef(signatories);
  latestSignatories.current = signatories;
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  /** Pointer-based drag (mouse, touch and pen): the card under the pointer swaps places live. */
  function handleDragStart(event: PointerEvent<HTMLElement>, key: string) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingKey(key);
  }

  function handleDragMove(event: PointerEvent<HTMLElement>) {
    if (!draggingKey || !listRef.current) return;
    const items = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-signatory-key]'));
    const from = items.findIndex((item) => item.dataset.signatoryKey === draggingKey);
    const to = items.findIndex((item) => {
      const rect = item.getBoundingClientRect();
      return event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    if (from === -1 || to === -1 || from === to) return;
    const next = [...signatories];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ signatories: next });
  }

  function handleDragEnd() {
    setDraggingKey(null);
  }

  function update(key: string, patch: Partial<SignatoryDraft>) {
    onChange({ signatories: signatories.map((item) => (item.key === key ? { ...item, ...patch } : item)) });
  }

  function add(role: SignatoryRole) {
    if (atLimit) return;
    const lastGroup = signatories.at(-1)?.group ?? 0;
    onChange({ signatories: [...signatories, emptySignatory(role, lastGroup + 1)] });
  }

  function duplicateAsNew(index: number) {
    if (atLimit) return;
    const source = signatories[index];
    const copy = { ...emptySignatory(source.role, source.group), key: newKey() };
    const next = [...signatories];
    next.splice(index + 1, 0, copy);
    onChange({ signatories: next });
  }

  function remove(key: string) {
    const index = signatories.findIndex((item) => item.key === key);
    const removed = signatories[index];
    onChange({ signatories: signatories.filter((item) => item.key !== key) });
    if (!removed) return;

    const hasData = [removed.name, removed.email, removed.cedula, removed.phone].some((field) => field.trim() !== '');
    if (!hasData) return;
    toast.info(`Quitaste a ${removed.name.trim() || `el firmante ${index + 1}`}.`, {
      action: {
        label: 'Deshacer',
        onClick: () => {
          const next = [...latestSignatories.current];
          next.splice(Math.min(index, next.length), 0, removed);
          onChange({ signatories: next });
        },
      },
    });
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= signatories.length) return;
    const next = [...signatories];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ signatories: next });
  }

  function changeMode(mode: SigningMode) {
    // Entering "groups" starts from the current sequential order so nothing jumps around.
    const next = mode === 'groups' ? signatories.map((item, index) => ({ ...item, group: signingOrderFor(draft, index) })) : signatories;
    onChange({ signingMode: mode, signatories: next });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold">Orden de firma</span>
          <Segmented
            label="Orden de firma"
            value={signingMode}
            onChange={changeMode}
            items={[
              { value: 'sequential', label: 'En orden' },
              { value: 'parallel', label: 'Todos a la vez' },
              { value: 'groups', label: 'Por pasos' },
            ]}
          />
        </div>
        <p className="text-[13px] text-slate-500">{MODE_HELP[signingMode]}</p>
        <SigningFlow draft={draft} />
      </div>

      {errors.signatories && <Alert tone="danger">{errors.signatories}</Alert>}

      <ol ref={listRef} className="flex flex-col gap-3">
        {signatories.map((signatory, index) => (
          <SignatoryCard
            key={signatory.key}
            index={index}
            total={signatories.length}
            signatory={signatory}
            mode={signingMode}
            order={signingOrderFor(draft, index)}
            errors={errors}
            onUpdate={(patch) => update(signatory.key, patch)}
            onRemove={() => remove(signatory.key)}
            onMove={(delta) => move(index, delta)}
            onDuplicate={() => duplicateAsNew(index)}
            canDuplicate={!atLimit}
            dragging={draggingKey === signatory.key}
            dragHandlers={
              signingMode === 'parallel'
                ? undefined
                : {
                    onPointerDown: (event) => handleDragStart(event, signatory.key),
                    onPointerMove: handleDragMove,
                    onPointerUp: handleDragEnd,
                    onPointerCancel: handleDragEnd,
                  }
            }
          />
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3">
        <Button icon={<Plus />} onClick={() => add('client')} disabled={atLimit}>
          Agregar firmante
        </Button>
        <Button variant="ghost" icon={<Plus />} onClick={() => add('witness')} disabled={atLimit}>
          Testigo
        </Button>
        <Button variant="ghost" icon={<Plus />} onClick={() => add('contractor')} disabled={atLimit}>
          Por la institución
        </Button>
        <span className="ml-auto text-xs text-slate-500 tabular">
          {signatories.length} de {MAX_SIGNATORIES}
        </span>
      </div>
    </div>
  );
}

interface SignatoryCardProps {
  index: number;
  total: number;
  signatory: SignatoryDraft;
  mode: SigningMode;
  order: number;
  errors: FieldErrors;
  onUpdate: (patch: Partial<SignatoryDraft>) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  canDuplicate: boolean;
  dragging: boolean;
  /** Absent when the order does not matter (everyone signs at once). */
  dragHandlers?: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
}

function SignatoryCard({
  index,
  total,
  signatory,
  mode,
  order,
  errors,
  onUpdate,
  onRemove,
  onMove,
  onDuplicate,
  canDuplicate,
  dragging,
  dragHandlers,
}: SignatoryCardProps) {
  const prefix = `sig:${signatory.key}:`;
  const cedulaCheck = validateCedula(signatory.cedula);
  const lookupCedula = cedulaCheck.ok ? cedulaCheck.value : '';
  const lookup = useUserLookup(lookupCedula);
  const found = lookup.data ?? null;
  const alreadyApplied = found !== null && signatory.linkedUserId === found.id;

  function applyFound() {
    if (!found) return;
    onUpdate({
      name: found.name,
      email: found.email,
      phone: found.phone ?? signatory.phone,
      linkedUserId: found.id,
    });
  }

  // Typing the cédula of a registered person fills the card by itself when nothing was typed by hand yet;
  // if the card already has a name or email, the «Usar sus datos» button lets the user choose.
  const cardIsBlank = !signatory.name.trim() && !signatory.email.trim();
  useEffect(() => {
    if (found && !alreadyApplied && cardIsBlank) applyFound();
    // applyFound only depends on the found person and this card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found?.id, alreadyApplied, cardIsBlank]);

  return (
    <li
      data-signatory-key={signatory.key}
      className={cn(
        'rounded-xl border bg-white transition-[box-shadow,border-color,transform] duration-150',
        dragging ? 'z-10 scale-[1.01] border-vino-300 shadow-pop' : 'animate-rise-in border-slate-200 shadow-card',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-2 py-2.5 sm:px-3">
        {dragHandlers && (
          <span
            role="button"
            tabIndex={-1}
            aria-label={`Arrastrar firmante ${index + 1} para reordenar`}
            title="Arrastra para reordenar"
            className={cn(
              'grid size-8 touch-none place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700',
              dragging ? 'cursor-grabbing' : 'cursor-grab',
            )}
            {...dragHandlers}
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </span>
        )}
        <span className="grid size-7 place-items-center rounded-full bg-vino-600 text-xs font-semibold text-white tabular" title="Paso de firma">
          {order}
        </span>
        <span className="text-sm font-semibold">Firmante {index + 1}</span>
        {signatory.linkedUserId && (
          <Badge tone="success" className="ml-1">
            Usuario registrado
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {mode !== 'parallel' && (
            <>
              <IconButton size="sm" label="Subir" disabled={index === 0} onClick={() => onMove(-1)}>
                <ArrowUp />
              </IconButton>
              <IconButton size="sm" label="Bajar" disabled={index === total - 1} onClick={() => onMove(1)}>
                <ArrowDown />
              </IconButton>
            </>
          )}
          <IconButton size="sm" label="Agregar otro con el mismo rol" disabled={!canDuplicate} onClick={onDuplicate}>
            <Copy />
          </IconButton>
          <IconButton size="sm" label={`Quitar firmante ${index + 1}`} disabled={total === 1} onClick={onRemove} className="hover:bg-red-50 hover:text-red-600">
            <Trash2 />
          </IconButton>
        </div>
      </div>

      <div className="grid gap-x-4 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <Field label="Cédula" error={errors[`${prefix}cedula`]}>
          <Input
            inputMode="numeric"
            className="font-mono"
            placeholder="000-0000000-0"
            value={signatory.cedula}
            onChange={(event) => onUpdate({ cedula: event.target.value, linkedUserId: null })}
            onBlur={() => cedulaCheck.ok && onUpdate({ cedula: formatCedula(cedulaCheck.value) })}
          />
        </Field>
        <Field label="Nombre completo" error={errors[`${prefix}name`]}>
          <Input value={signatory.name} autoComplete="off" onChange={(event) => onUpdate({ name: event.target.value })} />
        </Field>
        <Field label="Correo electrónico" error={errors[`${prefix}email`]}>
          <Input type="email" value={signatory.email} autoComplete="off" onChange={(event) => onUpdate({ email: event.target.value })} />
        </Field>
        <Field label="Teléfono" optional error={errors[`${prefix}phone`]}>
          <Input inputMode="tel" placeholder="809-000-0000" value={signatory.phone} onChange={(event) => onUpdate({ phone: event.target.value })} />
        </Field>
        <Field label="Rol">
          <Select value={signatory.role} onChange={(event) => onUpdate({ role: event.target.value as SignatoryRole })}>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {SIGNATORY_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>
        {mode === 'groups' && (
          <Field label="Paso" hint="Mismo paso = firman a la vez" error={errors[`${prefix}group`]}>
            <Input
              type="number"
              min={1}
              max={MAX_SIGNATORIES}
              className="tabular"
              value={signatory.group}
              onChange={(event) => onUpdate({ group: Math.max(1, Math.round(Number(event.target.value) || 1)) })}
            />
          </Field>
        )}
      </div>

      {found && !alreadyApplied && (
        <div className="mx-4 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm">
          <UserCheck className="size-4 text-green-700" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Esta cédula pertenece a <b>{found.name}</b> ({found.email}).
          </span>
          <Button size="sm" variant="success" onClick={applyFound}>
            Usar sus datos
          </Button>
        </div>
      )}
    </li>
  );
}

/** Compact visual of who signs in which step. */
function SigningFlow({ draft }: { draft: WizardDraft }) {
  const steps = useMemo(() => {
    const byOrder = new Map<number, string[]>();
    draft.signatories.forEach((signatory, index) => {
      const order = signingOrderFor(draft, index);
      const label = signatory.name.trim() || `Firmante ${index + 1}`;
      byOrder.set(order, [...(byOrder.get(order) ?? []), label]);
    });
    return [...byOrder.entries()].sort(([a], [b]) => a - b);
  }, [draft]);

  if (steps.length === 0) return null;

  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Secuencia de firma">
      {steps.map(([order, names], position) => (
        <li key={order} className="flex items-center gap-1.5">
          {position > 0 && <ArrowRight className="size-3.5 text-slate-400" aria-hidden="true" />}
          <span className={cn('flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 text-xs', names.length > 1 ? 'border-vino-200' : 'border-slate-200')}>
            {names.length > 1 && <Users className="size-3.5 text-vino-600" aria-hidden="true" />}
            <span className="font-semibold text-slate-500 tabular">{position + 1}.</span>
            <span className="max-w-[16rem] truncate">{names.join(', ')}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
