import { useEffect, useRef, useState } from 'react';
import { CircleCheck, Info, LoaderCircle, Search, UserPlus } from 'lucide-react';
import type { Variable } from '../../../lib/api/catalog-types';
import { useUserLookup } from '../../../lib/api/hooks/users';
import { formatCedula, validateCedula } from '../../../lib/validation';
import { Button, Field, Input, Select, Textarea, cn } from '../../../ui';
import { CLIENT_VARIABLE_FOR, isClientVariable, isContractBound, monthsBetween, type ClientField } from './bound-variables';
import { emptySignatory, type FieldErrors, type WizardDraft } from './wizard-state';

interface StepDetailsProps {
  draft: WizardDraft;
  variables: Variable[];
  errors: FieldErrors;
  onChange: (patch: Partial<WizardDraft>) => void;
}

const BOUND_SOURCES: Record<string, string> = {
  fecha_inicio: 'la fecha de inicio',
  fecha_fin: 'la fecha de fin',
  valor_contrato: 'el valor del contrato',
  duracion_meses: 'las fechas (duración en meses)',
};

export function StepDetails({ draft, variables, errors, onChange }: StepDetailsProps) {
  function setVariable(name: string, value: string) {
    onChange({ variables: { ...draft.variables, [name]: value } });
  }

  const bound = variables.filter((variable) => isContractBound(variable.name));
  const client = variables.filter((variable) => isClientVariable(variable.name));
  const others = variables.filter((variable) => !isContractBound(variable.name) && !isClientVariable(variable.name));
  const months = monthsBetween(draft.startDate, draft.endDate);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Título del contrato" error={errors.title} className="sm:col-span-2">
          <Input value={draft.title} onChange={(event) => onChange({ title: event.target.value })} maxLength={200} />
        </Field>
        <Field label="Valor del contrato (RD$)" error={errors.value} hint="Ej.: 87,500.00">
          <Input inputMode="decimal" className="tabular" value={draft.value} onChange={(event) => onChange({ value: event.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio" error={errors.startDate}>
            <Input type="date" value={draft.startDate} onChange={(event) => onChange({ startDate: event.target.value })} />
          </Field>
          <Field label="Fin" error={errors.endDate} hint={months ? `${months} ${months === 1 ? 'mes' : 'meses'}` : undefined}>
            <Input type="date" min={draft.startDate || undefined} value={draft.endDate} onChange={(event) => onChange({ endDate: event.target.value })} />
          </Field>
        </div>
        {bound.length > 0 && (
          <p className="flex items-start gap-2 text-[13px] text-slate-500 sm:col-span-2">
            <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span>
              El documento usa estos datos automáticamente: {bound.map((variable) => `«${variable.label}» (de ${BOUND_SOURCES[variable.name]})`).join(', ')}.
            </span>
          </p>
        )}
      </section>

      {client.length > 0 && <ClientSection draft={draft} variables={client} errors={errors} onChange={onChange} />}

      {others.length > 0 && (
        <section className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold">Datos del contrato</h3>
            <p className="text-[13px] text-slate-500">Se insertan en el documento en los lugares marcados.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {others.map((variable) => (
              <VariableField
                key={variable.id}
                variable={variable}
                value={draft.variables[variable.name]}
                error={errors[`var:${variable.name}`]}
                onChange={(value) => setVariable(variable.name, value)}
              />
            ))}
          </div>
        </section>
      )}

      <Field label="Notas internas" optional hint="No aparecen en el documento.">
        <Textarea value={draft.notes} onChange={(event) => onChange({ notes: event.target.value })} maxLength={2000} />
      </Field>
    </div>
  );
}

/**
 * The client: start from the cédula. If the person is registered, their name, email and phone are filled in
 * (and can be added as the first signatory); otherwise the fields are typed by hand.
 */
function ClientSection({ draft, variables, errors, onChange }: { draft: WizardDraft; variables: Variable[]; errors: FieldErrors; onChange: (patch: Partial<WizardDraft>) => void }) {
  const cedulaVariable = CLIENT_VARIABLE_FOR.cedula;
  const typedCedula = String(draft.variables[cedulaVariable] ?? '');
  const [searched, setSearched] = useState('');
  const check = validateCedula(typedCedula);
  const lookup = useUserLookup(searched);
  const found = lookup.data ?? null;
  const has = (field: ClientField) => variables.some((variable) => variable.name === CLIENT_VARIABLE_FOR[field]);
  const label = (field: ClientField) => variables.find((variable) => variable.name === CLIENT_VARIABLE_FOR[field]);

  function setClient(values: Partial<Record<ClientField, string>>) {
    const next = { ...draft.variables };
    for (const [field, value] of Object.entries(values) as [ClientField, string][]) {
      if (has(field) && value !== undefined) next[CLIENT_VARIABLE_FOR[field]] = value;
    }
    onChange({ variables: next });
  }

  function search() {
    if (!check.ok) return;
    setClient({ cedula: formatCedula(check.value) });
    setSearched(check.value);
  }

  // Fill the fields once per person found (the user can still edit them afterwards).
  const appliedId = useRef<string | null>(null);
  useEffect(() => {
    if (!found || appliedId.current === found.id) return;
    appliedId.current = found.id;
    setClient({ name: found.name, email: found.email, phone: found.phone ?? '' });
    // setClient reads the latest draft through props; only a new person found should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found]);

  const firstSignatory = draft.signatories[0];
  const alreadySignatory = found !== null && draft.signatories.some((signatory) => signatory.linkedUserId === found.id);
  function addAsSignatory() {
    if (!found) return;
    const person = {
      name: found.name,
      email: found.email,
      phone: found.phone ?? '',
      cedula: formatCedula(found.cedula ?? (check.ok ? check.value : '')),
      linkedUserId: found.id,
    };
    // Reuse the first signatory card if it is still empty; otherwise add a new one at the end.
    const emptyFirst = firstSignatory && !firstSignatory.name.trim() && !firstSignatory.cedula.trim();
    onChange({
      signatories: emptyFirst
        ? [{ ...firstSignatory, ...person, role: 'client' }, ...draft.signatories.slice(1)]
        : [...draft.signatories, { ...emptySignatory('client', 1), ...person }],
    });
  }

  const searching = Boolean(searched) && lookup.isFetching;
  const notFound = Boolean(searched) && !lookup.isFetching && lookup.isSuccess && !found;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
      <div>
        <h3 className="font-semibold">Cliente</h3>
        <p className="text-[13px] text-slate-500">Escribe su cédula: si ya está registrado, completamos sus datos.</p>
      </div>

      {has('cedula') && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label={label('cedula')?.label ?? 'Cédula'} error={errors[`var:${cedulaVariable}`]} className="sm:max-w-xs sm:flex-1">
            <Input
              className="font-mono"
              inputMode="numeric"
              placeholder="000-0000000-0"
              value={typedCedula}
              onChange={(event) => setClient({ cedula: event.target.value })}
              onBlur={search}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  search();
                }
              }}
            />
          </Field>
          <Button icon={searching ? <LoaderCircle className="animate-spin" /> : <Search />} onClick={search} disabled={!check.ok}>
            Buscar
          </Button>
        </div>
      )}

      {found && (
        <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <CircleCheck className="size-4 shrink-0 text-emerald-600" />
            <span>
              <b>{found.name}</b> está registrado: completamos sus datos.
            </span>
          </span>
          {alreadySignatory ? (
            <span className="text-[13px] text-emerald-800">Ya está entre los firmantes.</span>
          ) : (
            <Button size="sm" icon={<UserPlus />} onClick={addAsSignatory}>
              Añadir como firmante
            </Button>
          )}
        </div>
      )}
      {notFound && (
        <p className={cn('flex items-center gap-2 text-[13px] text-slate-600')}>
          <Info className="size-4 text-slate-400" /> No hay nadie registrado con esa cédula: escribe sus datos.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {variables
          .filter((variable) => variable.name !== cedulaVariable)
          .map((variable) => (
            <VariableField
              key={variable.id}
              variable={variable}
              value={draft.variables[variable.name]}
              error={errors[`var:${variable.name}`]}
              onChange={(value) => onChange({ variables: { ...draft.variables, [variable.name]: value } })}
            />
          ))}
      </div>
    </section>
  );
}

interface VariableFieldProps {
  variable: Variable;
  value: string | number | null | undefined;
  error?: string;
  onChange: (value: string) => void;
}

function VariableField({ variable, value, error, onChange }: VariableFieldProps) {
  const text = value === null || value === undefined ? '' : String(value);
  const common = { label: variable.label, error, hint: variable.description ?? undefined, optional: !variable.required };

  switch (variable.type) {
    case 'textarea':
      return (
        <Field {...common} className="sm:col-span-2">
          <Textarea value={text} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
    case 'select':
      return (
        <Field {...common}>
          <Select value={text} onChange={(event) => onChange(event.target.value)}>
            <option value="">Elige una opción…</option>
            {(variable.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
      );
    case 'date':
      return (
        <Field {...common}>
          <Input type="date" value={text} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
    case 'number':
      return (
        <Field {...common}>
          <Input inputMode="decimal" className="tabular" value={text} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
    default:
      return (
        <Field {...common}>
          <Input value={text} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
  }
}
