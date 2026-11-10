import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Save, Send } from 'lucide-react';
import { Alert, Button, ButtonLink, EmptyState, PageHeader, Skeleton, cn, useConfirm, useToast } from '../../../ui';
import { apiFetch } from '../../../lib/api/client';
import { useContract, useCreateContract, useUpdateContract } from '../../../lib/api/hooks/contracts';
import { useTemplate } from '../../../lib/api/hooks/templates';
import { useAuth } from '../../../lib/auth';
import { errorMessage } from '../../../lib/errors';
import { StepDetails } from './StepDetails';
import { StepReview } from './StepReview';
import { StepSignatories } from './StepSignatories';
import { rolesNeeded, withNeededSignatories } from './bound-variables';
import { StepTemplate } from './StepTemplate';
import {
  WIZARD_STEPS,
  draftFromContract,
  emptyDraft,
  emptySignatory,
  hasDraftContent,
  toContractInput,
  validateDetailsStep,
  validateSignatoriesStep,
  validateTemplateStep,
  type FieldErrors,
  type StepId,
  type WizardDraft,
} from './wizard-state';

const AUTOSAVE_DELAY_MS = 800;

/** New contract (/app/contratos/nuevo) or edit an existing draft (/app/contratos/:id/editar). */
export function ContractWizardPage() {
  const { id } = useParams();
  const existing = useContract(id ?? '');

  if (id && existing.isPending) return <Skeleton className="h-[70dvh] rounded-xl" />;
  if (id && existing.isError) {
    return <EmptyState title="No se pudo abrir el contrato" description={errorMessage(existing.error)} action={<ButtonLink to="/app/contratos">Volver</ButtonLink>} />;
  }
  if (id && existing.data && !existing.data.can.edit) {
    return (
      <EmptyState
        title="Este contrato ya no se puede editar"
        description="Solo se editan los borradores y los contratos devueltos."
        action={<ButtonLink to={`/app/contratos/${id}`}>Ver contrato</ButtonLink>}
      />
    );
  }

  return <Wizard key={id ?? 'new'} contractId={id} initial={existing.data ? draftFromContract(existing.data) : undefined} />;
}

interface WizardProps {
  contractId?: string;
  initial?: WizardDraft;
}

function Wizard({ contractId, initial }: WizardProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isEdit = Boolean(contractId);
  const storageKey = user ? `simaud:contract-draft:${user.id}` : null;

  const [draft, setDraft] = useState<WizardDraft>(() => initial ?? readLocalDraft(storageKey) ?? emptyDraft());
  const [restored, setRestored] = useState(() => !initial && readLocalDraft(storageKey) !== null);
  const [stepIndex, setStepIndex] = useState(isEdit ? 1 : 0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState<'draft' | 'submit' | null>(null);
  const confirm = useConfirm();
  const [initialSnapshot] = useState(() => JSON.stringify(initial ?? null));
  // Only edits of an existing contract can be lost: new drafts are autosaved for this tab.
  const hasUnsavedEdits = isEdit && submitting === null && JSON.stringify(draft) !== initialSnapshot;
  const blocker = useBlocker(hasUnsavedEdits);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirm({
      title: '¿Salir sin guardar los cambios?',
      description: 'Los cambios que hiciste en este contrato se perderán.',
      confirmLabel: 'Salir sin guardar',
      tone: 'primary',
    }).then((answer) => (answer ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm]);

  useEffect(() => {
    if (!hasUnsavedEdits) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedEdits]);

  const template = useTemplate(draft.templateId);
  const variables = useMemo(() => template.data?.resolvedVariables ?? [], [template.data]);
  const create = useCreateContract();
  const update = useUpdateContract(contractId ?? '');
  const step: StepId = WIZARD_STEPS[stepIndex].id;

  // Autosave new contracts for this tab (sessionStorage: signatory data must not linger on shared computers).
  useEffect(() => {
    if (isEdit || !storageKey) return;
    // Nothing written yet → nothing stored (so no «contrato a medias» appears on the next visit).
    const timer = window.setTimeout(
      () => (hasDraftContent(draft) ? writeLocalDraft(storageKey, draft) : clearLocalDraft(storageKey)),
      AUTOSAVE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [draft, isEdit, storageKey]);

  const patch = useCallback((changes: Partial<WizardDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
  }, []);

  function validateStep(target: StepId): FieldErrors {
    if (target === 'template') return validateTemplateStep(draft);
    if (target === 'details') return validateDetailsStep(draft, variables);
    if (target === 'signatories') return validateSignatoriesStep(draft, variables);
    return {};
  }

  function validateUpTo(index: number): { ok: boolean; failedAt: number } {
    for (let current = 0; current < index; current += 1) {
      const found = validateStep(WIZARD_STEPS[current].id);
      if (Object.keys(found).length > 0) {
        setErrors(found);
        return { ok: false, failedAt: current };
      }
    }
    setErrors({});
    return { ok: true, failedAt: -1 };
  }

  function goTo(index: number) {
    if (index <= stepIndex) {
      setErrors({});
      setStepIndex(index);
      return;
    }
    const result = validateUpTo(index);
    const target = result.ok ? index : result.failedAt;
    // Arriving at «Firmantes»: one card per person the document names (client, institution…), ready to fill.
    if (WIZARD_STEPS[target].id === 'signatories') {
      const roles = rolesNeeded(variables);
      if (roles.length > 0) {
        setDraft((current) => ({ ...current, signatories: withNeededSignatories(current.signatories, roles, (role) => emptySignatory(role, 1)) }));
      }
    }
    setStepIndex(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(sendToApproval: boolean) {
    const result = validateUpTo(WIZARD_STEPS.length - 1);
    if (!result.ok) {
      setStepIndex(result.failedAt);
      return;
    }
    setSubmitting(sendToApproval ? 'submit' : 'draft');
    try {
      const input = toContractInput(draft, variables.map((variable) => variable.name));
      const saved = isEdit ? await update.mutateAsync(input) : await create.mutateAsync(input);
      if (sendToApproval) await apiFetch(`/contracts/${saved.id}/submit`, { method: 'POST' });
      if (storageKey && !isEdit) clearLocalDraft(storageKey);
      toast.success(sendToApproval ? 'Contrato enviado a aprobación.' : 'Borrador guardado.');
      navigate(`/app/contratos/${saved.id}`, { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo guardar el contrato.'));
      setSubmitting(null);
    }
  }

  function discardLocalDraft() {
    if (storageKey) clearLocalDraft(storageKey);
    setDraft(emptyDraft());
    setStepIndex(0);
    setErrors({});
    setRestored(false);
    toast.success('Descartado. Empiezas un contrato nuevo.');
  }

  const isLast = stepIndex === WIZARD_STEPS.length - 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isEdit ? 'Editar contrato' : 'Nuevo contrato'}
        description={isEdit ? draft.title : 'Cuatro pasos: plantilla, datos, firmantes y revisión.'}
        actions={<ButtonLink to={isEdit ? `/app/contratos/${contractId}` : '/app/contratos'} variant="ghost">Cancelar</ButtonLink>}
      />

      {restored && step === 'template' && (
        <Alert
          tone="info"
          action={
            <Button size="sm" onClick={discardLocalDraft}>
              Empezar de cero
            </Button>
          }
        >
          Recuperamos el contrato que dejaste a medias en esta pestaña.
        </Alert>
      )}

      <Stepper current={stepIndex} onSelect={goTo} />

      <div key={step} className="animate-page-in rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
        {step === 'template' && (
          <StepTemplate
            selectedId={draft.templateId}
            locked={isEdit}
            error={errors.templateId}
            onSelect={(templateId, title) => patch({ templateId, title: draft.title || title, variables: templateId === draft.templateId ? draft.variables : {} })}
          />
        )}
        {step === 'details' && <StepDetails draft={draft} variables={variables} errors={errors} onChange={patch} />}
        {step === 'signatories' && <StepSignatories draft={draft} errors={errors} onChange={patch} />}
        {step === 'review' && <StepReview draft={draft} template={template.data} />}
      </div>

      {Object.keys(errors).length > 0 && <Alert tone="danger">Revisa los campos marcados antes de continuar.</Alert>}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button variant="ghost" icon={<ArrowLeft />} disabled={stepIndex === 0} onClick={() => goTo(stepIndex - 1)}>
          Atrás
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          {isLast ? (
            <>
              <Button icon={<Save />} loading={submitting === 'draft'} disabled={submitting !== null} onClick={() => void save(false)}>
                Guardar borrador
              </Button>
              <Button variant="primary" icon={<Send />} loading={submitting === 'submit'} disabled={submitting !== null} onClick={() => void save(true)}>
                Enviar a aprobación
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => goTo(stepIndex + 1)}>
              Continuar <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ current, onSelect }: { current: number; onSelect: (index: number) => void }) {
  return (
    <nav aria-label="Pasos">
      <ol className="flex items-center gap-2">
        {WIZARD_STEPS.map((item, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={item.id} className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={active ? 'step' : undefined}
                className="flex min-w-0 items-center gap-2 rounded-lg py-1 text-left"
              >
                <span
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold transition-colors duration-300',
                    active && 'border-vino-600 bg-vino-600 text-white',
                    done && 'border-vino-200 bg-vino-50 text-vino-700',
                    !active && !done && 'border-slate-300 bg-white text-slate-500',
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                </span>
                <span className={cn('hidden truncate text-sm font-medium sm:block', active ? 'text-slate-900' : 'text-slate-500')}>{item.label}</span>
              </button>
              {index < WIZARD_STEPS.length - 1 && (
                <span className="h-px min-w-4 flex-1 overflow-hidden bg-slate-200" aria-hidden="true">
                  <span className={cn('block h-full origin-left bg-vino-400 transition-transform duration-500', done ? 'scale-x-100' : 'scale-x-0')} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function readLocalDraft(key: string | null): WizardDraft | null {
  if (!key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardDraft;
    // A visit that only picked a template is not worth announcing as unfinished work.
    return Array.isArray(parsed.signatories) && hasDraftContent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalDraft(key: string, draft: WizardDraft) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage may be full or blocked; autosave is a convenience only.
  }
}

function clearLocalDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore: nothing to clean.
  }
}
