import { useState } from 'react';
import { Check, FileText } from 'lucide-react';
import { Alert, EmptyState, SearchInput, Skeleton, cn } from '../../../ui';
import { useTemplates } from '../../../lib/api/hooks/templates';
import { errorMessage } from '../../../lib/errors';

interface StepTemplateProps {
  selectedId: string;
  error?: string;
  /** Locked when editing an existing contract: the template cannot change. */
  locked: boolean;
  onSelect: (templateId: string, title: string) => void;
}

export function StepTemplate({ selectedId, error, locked, onSelect }: StepTemplateProps) {
  const [search, setSearch] = useState('');
  const templates = useTemplates({ status: 'active', q: search || undefined });

  if (templates.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }
  if (templates.isError) return <Alert tone="danger">{errorMessage(templates.error)}</Alert>;

  const items = templates.data;

  return (
    <div className="flex flex-col gap-4">
      {locked && <Alert tone="info">La plantilla no se puede cambiar en un contrato ya creado.</Alert>}
      {!locked && <SearchInput value={search} onChange={setSearch} placeholder="Buscar plantilla…" />}
      {error && <Alert tone="danger">{error}</Alert>}

      {items.length === 0 ? (
        <EmptyState icon={<FileText />} title="No hay plantillas activas" description="Pide a un supervisor que active o cree una plantilla." />
      ) : (
        <div role="radiogroup" aria-label="Plantillas" className="stagger grid gap-3 [--stagger-step:40ms] sm:grid-cols-2 lg:grid-cols-3">
          {items.map((template) => {
            const selected = template.id === selectedId;
            return (
              <button
                key={template.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked && !selected}
                onClick={() => onSelect(template.id, template.title)}
                className={cn(
                  'group relative flex flex-col gap-2 rounded-xl border bg-white p-4 text-left transition-all duration-200 disabled:opacity-50',
                  selected ? 'border-vino-500 shadow-pop ring-2 ring-vino-100' : 'border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-pop',
                )}
              >
                <span className="flex items-start gap-3">
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', selected ? 'bg-vino-600 text-white' : 'bg-vino-50 text-vino-600')}>
                    {selected ? <Check className="size-4" /> : <FileText className="size-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{template.title}</span>
                    <span className="block text-xs text-slate-500">{template.category}</span>
                  </span>
                </span>
                {template.description && <span className="line-clamp-2 text-[13px] text-slate-500">{template.description}</span>}
                <span className="mt-auto text-xs text-slate-400">
                  {template.variables.length} {template.variables.length === 1 ? 'dato a completar' : 'datos a completar'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
