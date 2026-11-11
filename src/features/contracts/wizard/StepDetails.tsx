import { Info, Users } from 'lucide-react';
import type { Variable } from '../../../lib/api/catalog-types';
import { Field, Input, Select, Textarea } from '../../../ui';
import { isContractBound, isPartyVariable, monthsBetween, partyOf } from './bound-variables';
import type { FieldErrors, WizardDraft } from './wizard-state';

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
  const people = variables.filter((variable) => isPartyVariable(variable.name));
  const others = variables.filter((variable) => !isContractBound(variable.name) && !isPartyVariable(variable.name));
  const peopleRoles = [...new Set(people.map((variable) => partyOf(variable.name)?.label).filter(Boolean))];
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

      {people.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600">
          <Users className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            Los datos de las personas (nombre, cédula, correo y teléfono) se toman de los <b>firmantes</b> del paso siguiente: basta
            con buscarlos por cédula. El documento necesita un firmante con rol {peopleRoles.map((role) => `«${role}»`).join(' y ')}.
          </span>
        </p>
      )}

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
    case 'money':
      return (
        <Field {...common} hint={variable.description ?? 'En pesos dominicanos, p. ej. 25000 o 25000.50'}>
          <Input inputMode="decimal" className="tabular" placeholder="0.00" value={text} onChange={(event) => onChange(event.target.value)} />
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
