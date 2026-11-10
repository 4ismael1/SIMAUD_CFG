import { useState } from 'react';
import { Button, Checkbox, Dialog, Field, Input, Segmented, Select, cn } from '../../../ui';
import {
  DEFAULT_PAGE,
  FONTS,
  FONT_SIZES,
  LINE_HEIGHTS,
  MARGIN_PRESETS,
  MARGIN_RANGE,
  PAPER_SIZES,
  resolvePage,
} from '../../../lib/rich-doc/page';
import type { BandSlot, DocAttrs, DocumentFont, PageBand, PageMargins, PaperSize } from '../../../lib/rich-doc/types';

/**
 * «Página»: paper, margins, font, size, spacing, header and footer of a template (rich-v2).
 * Changes apply when pressing «Aplicar», so trying values never leaves the document half-changed.
 */

interface PageSetupDialogProps {
  open: boolean;
  value: DocAttrs;
  onClose: () => void;
  onApply: (value: DocAttrs) => void;
}

type Tab = 'page' | 'header' | 'footer';
type Position = 'left' | 'center' | 'right';
type SlotKind = 'none' | BandSlot['kind'];

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'left', label: 'Izquierda' },
  { value: 'center', label: 'Centro' },
  { value: 'right', label: 'Derecha' },
];

const SLOT_KINDS: { value: SlotKind; label: string }[] = [
  { value: 'none', label: 'Nada' },
  { value: 'text', label: 'Texto' },
  { value: 'logo', label: 'Logo de la institución' },
  { value: 'pageNumber', label: 'Número de página' },
];

export function PageSetupDialog({ open, value, onClose, onApply }: PageSetupDialogProps) {
  const [tab, setTab] = useState<Tab>('page');
  const [page, setPage] = useState(() => resolvePage(value.page));
  const [header, setHeader] = useState<PageBand>(value.header ?? {});
  const [footer, setFooter] = useState<PageBand>(value.footer ?? {});

  const setMargin = (side: keyof PageMargins, raw: string) => {
    const number = Math.round(Number(raw));
    if (!Number.isFinite(number)) return;
    setPage({ ...page, margins: { ...page.margins, [side]: Math.min(MARGIN_RANGE.max, Math.max(MARGIN_RANGE.min, number)) } });
  };
  const presetIndex = MARGIN_PRESETS.findIndex((preset) => JSON.stringify(preset.margins) === JSON.stringify(page.margins));

  function apply() {
    onApply({ page, header, footer });
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="drawer"
      title="Configurar página"
      description="Se aplica igual en pantalla y en el PDF de cada contrato."
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() => {
              setPage({ ...DEFAULT_PAGE, margins: { ...DEFAULT_PAGE.margins } });
              setHeader({});
              setFooter({});
            }}
          >
            Restablecer
          </Button>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={apply}>
            Aplicar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Segmented
          label="Sección"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'page', label: 'Página' },
            { value: 'header', label: 'Encabezado' },
            { value: 'footer', label: 'Pie' },
          ]}
        />

        {tab === 'page' && (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium text-slate-900">Papel</legend>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(PAPER_SIZES) as PaperSize[]).map((size) => (
                  <PaperOption key={size} size={size} selected={page.size === size} onSelect={() => setPage({ ...page, size })} />
                ))}
              </div>
            </fieldset>

            <Field label="Márgenes">
              <Select
                value={presetIndex >= 0 ? String(presetIndex) : 'custom'}
                onChange={(event) => {
                  const preset = MARGIN_PRESETS[Number(event.target.value)];
                  if (preset) setPage({ ...page, margins: { ...preset.margins } });
                }}
              >
                {MARGIN_PRESETS.map((preset, index) => (
                  <option key={preset.label} value={index}>
                    {preset.label}
                  </option>
                ))}
                {presetIndex < 0 && <option value="custom">Personalizados</option>}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
                <Field key={side} label={{ top: 'Superior', bottom: 'Inferior', left: 'Izquierdo', right: 'Derecho' }[side]} hint="mm">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={MARGIN_RANGE.min}
                    max={MARGIN_RANGE.max}
                    value={page.margins[side]}
                    onChange={(event) => setMargin(side, event.target.value)}
                  />
                </Field>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Fuente">
                <Select value={page.font} onChange={(event) => setPage({ ...page, font: event.target.value as DocumentFont })}>
                  {(Object.keys(FONTS) as DocumentFont[]).map((font) => (
                    <option key={font} value={font}>
                      {FONTS[font].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tamaño">
                <Select value={String(page.fontSize)} onChange={(event) => setPage({ ...page, fontSize: Number(event.target.value) })}>
                  {FONT_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {String(size).replace('.', ',')} pt
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Interlineado">
                <Select value={String(page.lineHeight)} onChange={(event) => setPage({ ...page, lineHeight: Number(event.target.value) })}>
                  {LINE_HEIGHTS.map((height) => (
                    <option key={height} value={height}>
                      {String(height).replace('.', ',')}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </>
        )}

        {tab === 'header' && <BandEditor band={header} onChange={setHeader} kind="encabezado" />}
        {tab === 'footer' && <BandEditor band={footer} onChange={setFooter} kind="pie" />}
      </div>
    </Dialog>
  );
}

function PaperOption({ size, selected, onSelect }: { size: PaperSize; selected: boolean; onSelect: () => void }) {
  const paper = PAPER_SIZES[size];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors',
        selected ? 'border-vino-500 bg-vino-50/60 ring-1 ring-vino-500' : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('block rounded-[2px] border bg-white shadow-sm', selected ? 'border-vino-300' : 'border-slate-300')}
        style={{ width: 30, height: (30 * paper.heightMm) / paper.widthMm }}
      />
      <span className="text-[13px] font-medium text-slate-900">{paper.label}</span>
      <span className="text-[11px] text-slate-500">{paper.detail}</span>
    </button>
  );
}

function BandEditor({ band, onChange, kind }: { band: PageBand; onChange: (band: PageBand) => void; kind: 'encabezado' | 'pie' }) {
  const setSlot = (position: Position, slot: BandSlot | undefined) => {
    const next = { ...band };
    if (slot) next[position] = slot;
    else delete next[position];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-slate-500">
        Elige qué va en cada parte del {kind}. Déjalo en «Nada» para que no aparezca. El logo es el de Configuración › Institución.
      </p>
      {POSITIONS.map((position) => (
        <SlotEditor key={position.value} label={position.label} slot={band[position.value]} onChange={(slot) => setSlot(position.value, slot)} />
      ))}
      <Checkbox
        checked={band.skipFirstPage ?? false}
        onChange={(event) => onChange({ ...band, skipFirstPage: event.target.checked || undefined })}
        label={`No mostrar el ${kind} en la primera página`}
      />
    </div>
  );
}

function SlotEditor({ label, slot, onChange }: { label: string; slot: BandSlot | undefined; onChange: (slot: BandSlot | undefined) => void }) {
  const kind: SlotKind = slot?.kind ?? 'none';
  function setKind(next: SlotKind) {
    if (next === 'none') onChange(undefined);
    else if (next === 'text') onChange({ kind: 'text', text: '', size: 9 });
    else if (next === 'logo') onChange({ kind: 'logo', height: 14 });
    else onChange({ kind: 'pageNumber', format: 'pageOfTotal' });
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-start">
        <Field label={label}>
          <Select value={kind} onChange={(event) => setKind(event.target.value as SlotKind)}>
            {SLOT_KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        {slot?.kind === 'text' && (
          <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
            <Field label="Texto">
              <Input value={slot.text} maxLength={120} onChange={(event) => onChange({ ...slot, text: event.target.value })} />
            </Field>
            <Field label="Tamaño">
              <Select value={String(slot.size ?? 9)} onChange={(event) => onChange({ ...slot, size: Number(event.target.value) })}>
                {[7, 8, 9, 10, 11, 12, 14].map((size) => (
                  <option key={size} value={size}>
                    {size} pt
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {slot?.kind === 'logo' && (
          <Field label="Altura" hint={`${slot.height ?? 14} mm`}>
            <input
              type="range"
              min={8}
              max={40}
              value={slot.height ?? 14}
              onChange={(event) => onChange({ ...slot, height: Number(event.target.value) })}
              className="w-full accent-vino-600"
            />
          </Field>
        )}
        {slot?.kind === 'pageNumber' && (
          <Field label="Formato">
            <Select value={slot.format ?? 'pageOfTotal'} onChange={(event) => onChange({ ...slot, format: event.target.value as 'page' | 'pageOfTotal' })}>
              <option value="pageOfTotal">Página 3 de 7</option>
              <option value="page">3</option>
            </Select>
          </Field>
        )}
      </div>
    </div>
  );
}
