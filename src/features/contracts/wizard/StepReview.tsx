import { useEffect } from 'react';
import { CalendarRange, CircleDollarSign, FileText, Users } from 'lucide-react';
import { Alert, Skeleton } from '../../../ui';
import { previewContent, usePreviewTemplate } from '../../../lib/api/hooks/templates';
import type { TemplateDetail } from '../../../lib/api/catalog-types';
import { errorMessage } from '../../../lib/errors';
import { formatDate, formatMoney } from '../../../lib/format';
import { validateMoney } from '../../../lib/validation';
import { DocumentView } from '../components/DocumentView';
import { SIGNATORY_ROLE_LABELS } from '../components/SignatoriesPanel';
import { signingOrderFor, type WizardDraft } from './wizard-state';
import { effectiveVariables, slotPartyValues } from './bound-variables';

interface StepReviewProps {
  draft: WizardDraft;
  template: TemplateDetail | undefined;
}

export function StepReview({ draft, template }: StepReviewProps) {
  const preview = usePreviewTemplate();
  const { mutate } = preview;
  const content = template?.content;
  const contentFormat = template?.contentFormat;

  useEffect(() => {
    if (!content) return;
    // With signature boxes, the people's data comes from the box each person signs (T19).
    const people = template?.signatureSlots?.length ? slotPartyValues(draft.signatories, template.signatureSlots) : {};
    mutate({ contentFormat, content, values: { ...effectiveVariables(draft, template?.variables), ...people } });
  }, [content, contentFormat, draft, template?.variables, template?.signatureSlots, mutate]);

  const money = validateMoney(draft.value);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-w-0 flex-col gap-3">
        <h3 className="font-semibold">Vista previa del documento</h3>
        {preview.isError && <Alert tone="danger">{errorMessage(preview.error)}</Alert>}
        {preview.data && preview.data.missing.length > 0 && (
          <Alert tone="warning">Faltan datos en el documento: {preview.data.missing.join(', ')}.</Alert>
        )}
        {preview.data ? (
          <DocumentView content={previewContent(preview.data)} heading={draft.title} subheading="Borrador · vista previa" className="max-h-[70dvh] overflow-y-auto" />
        ) : (
          <Skeleton className="h-[60dvh] rounded-md" />
        )}
      </section>

      <aside className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-card lg:sticky lg:top-24">
        <h3 className="font-semibold">Resumen</h3>
        <dl className="flex flex-col gap-3 text-sm">
          <SummaryRow icon={<FileText />} label="Plantilla" value={template?.title ?? '—'} />
          <SummaryRow icon={<CircleDollarSign />} label="Valor" value={money.ok ? formatMoney(money.value) : draft.value} />
          <SummaryRow
            icon={<CalendarRange />}
            label="Vigencia"
            value={draft.startDate && draft.endDate ? `${formatDate(draft.startDate)} → ${formatDate(draft.endDate)}` : '—'}
          />
          <SummaryRow icon={<Users />} label="Firmantes" value={String(draft.signatories.length)} />
        </dl>
        <ol className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
          {draft.signatories.map((signatory, index) => (
            <li key={signatory.key} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold tabular">
                {signingOrderFor(draft, index)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{signatory.name}</span>
                <span className="block truncate text-xs text-slate-500">
                  {signatory.roleLabel || SIGNATORY_ROLE_LABELS[signatory.role]} · {signatory.email}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-slate-500">
          Al enviarlo a aprobación, un supervisor lo revisará antes de que se pida ninguna firma. Mientras sea borrador puedes seguir editándolo.
        </p>
      </aside>
    </div>
  );
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-slate-400 [&_svg]:size-4">{icon}</span>
      <dt className="w-20 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium break-words">{value}</dd>
    </div>
  );
}
