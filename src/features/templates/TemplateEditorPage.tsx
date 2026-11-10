import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { Braces, Plus, Save } from 'lucide-react';
import { Alert, Button, ButtonLink, Card, CardHeader, EmptyState, Field, Input, PageHeader, Skeleton, Textarea, cn, useAction, useConfirm } from '../../ui';
import { useCreateTemplate, usePreviewTemplate, useTemplate, useUpdateTemplate } from '../../lib/api/hooks/templates';
import { useVariables } from '../../lib/api/hooks/variables';
import type { TemplateDetail, Variable } from '../../lib/api/catalog-types';
import { errorMessage } from '../../lib/errors';
import { DocumentView } from '../contracts/components/DocumentView';
import { VARIABLE_TYPE_LABELS, VariableDialog } from './TemplatesPage';

const PREVIEW_DELAY_MS = 500;

/** /app/plantillas/nueva and /app/plantillas/:id */
export function TemplateEditorPage() {
  const { id } = useParams();
  const template = useTemplate(id ?? '');
  if (id && template.isPending) return <Skeleton className="h-[70dvh] rounded-xl" />;
  if (id && template.isError) {
    return <EmptyState title="No se pudo abrir la plantilla" description={errorMessage(template.error)} action={<ButtonLink to="/app/plantillas">Volver</ButtonLink>} />;
  }
  return <Editor key={id ?? 'new'} template={template.data} />;
}

interface Draft {
  title: string;
  category: string;
  description: string;
  content: string;
}

function Editor({ template }: { template?: TemplateDetail }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { runAction, running } = useAction();
  const variables = useVariables();
  const create = useCreateTemplate();
  const update = useUpdateTemplate(template?.id ?? '');
  const preview = usePreviewTemplate();
  const { mutate: requestPreview } = preview;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const initial = useMemo<Draft>(
    () => ({ title: template?.title ?? '', category: template?.category ?? 'General', description: template?.description ?? '', content: template?.content ?? '' }),
    [template],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [saved, setSaved] = useState(false);
  const [suggest, setSuggest] = useState<{ query: string; index: number } | null>(null);
  const [errors, setErrors] = useState<{ title?: string; content?: string }>({});
  /** Name to prefill in the "new variable" drawer ('' = blank); null = closed. */
  const [creating, setCreating] = useState<string | null>(null);

  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(initial);
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirm({ title: '¿Salir sin guardar?', description: 'Perderás los cambios de esta plantilla.', confirmLabel: 'Salir sin guardar' }).then((answer) =>
      answer ? blocker.proceed() : blocker.reset(),
    );
  }, [blocker, confirm]);

  const used = useMemo(() => new Set([...draft.content.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map((match) => match[1])), [draft.content]);
  const unknown = [...used].filter((name) => !(variables.data ?? []).some((variable) => variable.name === name));
  const hasUnknown = unknown.length > 0;

  // Live preview. No values are sent: the API validates them by type (a date must be AAAA-MM-DD),
  // so the placeholders are swapped for each variable's label here instead.
  useEffect(() => {
    if (!draft.content.trim() || hasUnknown) return;
    const timer = window.setTimeout(() => requestPreview({ content: draft.content, values: {} }), PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft.content, hasUnknown, requestPreview]);
  const previewHtml = useMemo(
    () => (preview.data ? labelPlaceholders(preview.data.html, variables.data ?? []) : undefined),
    [preview.data, variables.data],
  );
  const suggestions = suggest ? (variables.data ?? []).filter((variable) => variable.name.includes(suggest.query) || variable.label.toLowerCase().includes(suggest.query)) : [];

  function insertVariable(variable: Variable) {
    const element = textareaRef.current;
    if (!element) return;
    const start = element.selectionStart;
    const before = draft.content.slice(0, start);
    const after = draft.content.slice(element.selectionEnd);
    // Replace a partially typed "{{nam" if the user is completing a suggestion.
    const prefixMatch = before.match(/\{\{\s*([a-z0-9_]*)$/);
    const head = prefixMatch ? before.slice(0, before.length - prefixMatch[0].length) : before;
    const token = `{{${variable.name}}}`;
    setDraft({ ...draft, content: head + token + after });
    setSuggest(null);
    requestAnimationFrame(() => {
      element.focus();
      const caret = head.length + token.length;
      element.setSelectionRange(caret, caret);
    });
  }

  function updateSuggestions(value: string, caret: number) {
    const match = value.slice(0, caret).match(/\{\{\s*([a-z0-9_]*)$/);
    setSuggest(match ? { query: match[1], index: 0 } : null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!suggest || suggestions.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setSuggest({ ...suggest, index: (suggest.index + delta + suggestions.length) % suggestions.length });
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      insertVariable(suggestions[suggest.index]);
    } else if (event.key === 'Escape') {
      setSuggest(null);
    }
  }

  async function handleSave() {
    const next: typeof errors = {};
    if (draft.title.trim().length < 3) next.title = 'Escribe un título de al menos 3 caracteres.';
    if (draft.content.trim().length < 20) next.content = 'El contenido es demasiado corto.';
    if (unknown.length > 0) next.content = `Variables que no existen: ${unknown.join(', ')}. Créalas en la pestaña Variables o corrígelas.`;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const body = { title: draft.title.trim(), category: draft.category.trim() || 'General', description: draft.description.trim() || null, content: draft.content };
    const result = await runAction({
      run: () => (template ? update.mutateAsync(body) : create.mutateAsync(body)),
      success: template ? 'Plantilla guardada.' : 'Plantilla creada.',
    });
    if (result.ok) {
      setSaved(true);
      navigate('/app/plantillas', { replace: true });
    }
  }

  return (
    <>
      <PageHeader
        title={template ? 'Editar plantilla' : 'Nueva plantilla'}
        description="Escribe el texto del contrato. Inserta datos con {{variable}}: al teclear «{{» aparecen las sugerencias."
        actions={
          <>
            <ButtonLink to="/app/plantillas" variant="ghost">Cancelar</ButtonLink>
            <Button variant="primary" icon={<Save />} loading={running} onClick={() => void handleSave()}>Guardar</Button>
          </>
        }
      />
      {template && template.usageCount ? (
        <Alert tone="info">Los {template.usageCount} contratos ya creados con esta plantilla no cambian: conservan su propia versión.</Alert>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex flex-col gap-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Título" error={errors.title}>
                <Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </Field>
              <Field label="Categoría">
                <Input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
              </Field>
            </div>
            <Field label="Descripción" optional>
              <Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Field>
            <div className="relative">
              <Field label="Contenido" error={errors.content} hint="Separa las cláusulas con una línea en blanco. **texto** se muestra en negrita.">
                <Textarea
                  ref={textareaRef}
                  rows={20}
                  className="font-serif text-[14px] leading-relaxed"
                  value={draft.content}
                  onChange={(event) => {
                    setDraft({ ...draft, content: event.target.value });
                    updateSuggestions(event.target.value, event.target.selectionStart);
                  }}
                  onKeyDown={handleKeyDown}
                  onBlur={() => window.setTimeout(() => setSuggest(null), 150)}
                />
              </Field>
              {suggest && suggestions.length > 0 && (
                <ul role="listbox" aria-label="Variables sugeridas" className="absolute right-3 bottom-3 left-3 z-10 max-h-56 animate-pop-in overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-pop">
                  {suggestions.map((variable, index) => (
                    <li key={variable.id} role="option" aria-selected={index === suggest.index}>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          insertVariable(variable);
                        }}
                        className={cn('flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm', index === suggest.index ? 'bg-vino-50' : 'hover:bg-slate-50')}
                      >
                        <span className="font-mono text-xs">{`{{${variable.name}}}`}</span>
                        <span className="truncate text-xs text-slate-500">{variable.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <VariablePalette variables={variables.data ?? []} used={used} onInsert={insertVariable} onCreate={() => setCreating('')} />
          </div>
        </Card>

        <section className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-24">
          <CardHeader title="Vista previa" description="Con los nombres de los datos en lugar de valores reales." className="px-0 pt-0" />
          {hasUnknown ? (
            <Alert tone="warning">
              <div className="flex flex-col gap-2">
                <span>Estas variables no existen todavía. Créalas o corrige el nombre para ver la vista previa:</span>
                <div className="flex flex-wrap gap-1.5">
                  {unknown.map((name) => (
                    <Button key={name} size="sm" icon={<Plus />} onClick={() => setCreating(name)}>
                      <span className="font-mono text-xs">{name}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </Alert>
          ) : (
            preview.isError && <Alert tone="danger">{errorMessage(preview.error)}</Alert>
          )}
          {draft.content.trim() && previewHtml !== undefined && !hasUnknown ? (
            <DocumentView escapedContent={previewHtml} heading={draft.title || 'Sin título'} className="max-h-[75dvh] overflow-y-auto" />
          ) : (
            <Card><EmptyState icon={<Braces />} title="Escribe el contenido" description="La vista previa aparecerá aquí." /></Card>
          )}
        </section>
      </div>
      {creating !== null && <VariableDialog variable={null} initialName={creating} onClose={() => setCreating(null)} />}
    </>
  );
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Replace the `{{name}}` left in the escaped preview text with «[Label]», escaped the same way. */
function labelPlaceholders(escapedHtml: string, variables: Variable[]): string {
  const labels = new Map(variables.map((variable) => [variable.name, variable.label]));
  return escapedHtml.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (match, name: string) => {
    const label = labels.get(name);
    return label ? `[${label}]`.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]) : match;
  });
}

interface VariablePaletteProps {
  variables: Variable[];
  used: Set<string>;
  onInsert: (variable: Variable) => void;
  onCreate: () => void;
}

function VariablePalette({ variables, used, onInsert, onCreate }: VariablePaletteProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">Insertar variable</span>
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={onCreate}>Nueva variable</Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {variables.map((variable) => (
          <button
            key={variable.id}
            type="button"
            title={`${variable.label} · ${VARIABLE_TYPE_LABELS[variable.type]}`}
            onClick={() => onInsert(variable)}
            className={cn(
              'rounded-md border px-2 py-1 font-mono text-[11.5px] transition-colors',
              used.has(variable.name) ? 'border-vino-200 bg-vino-50 text-vino-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
            )}
          >
            {variable.name}
          </button>
        ))}
      </div>
    </div>
  );
}
