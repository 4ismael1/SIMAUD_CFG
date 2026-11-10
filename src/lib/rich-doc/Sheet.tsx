import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ImageIcon } from 'lucide-react';
import { cn } from '../../ui';
import { PAPER_SIZES, isBandEmpty, resolvePage, sheetStyle } from './page';
import type { BandSlot, DocAttrs, PageBand } from './types';

/**
 * A sheet of paper with the document's real size, margins, font, header and footer (rich-v2).
 * Used by the editor and by every read-only view, so the screen matches the PDF.
 *
 * The page breaks drawn here are an estimate from the text height; the exact cut is the one in the
 * PDF preview (the API paginates). On narrow screens the sheet keeps its proportions but reflows text.
 */

interface SheetProps {
  attrs: DocAttrs | undefined;
  children: ReactNode;
  /** Draw estimated page ends while editing. */
  showPageBreaks?: boolean;
  className?: string;
}

export function Sheet({ attrs, children, showPageBreaks = false, className }: SheetProps) {
  const page = resolvePage(attrs?.page);
  const paper = PAPER_SIZES[page.size];
  const sheetRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);
  const [pageHeight, setPageHeight] = useState(0);

  // Recount pages whenever the sheet or its text changes size.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const measure = () => {
      const width = sheet.clientWidth;
      const height = (width * paper.heightMm) / paper.widthMm;
      const top = (width * page.margins.top) / paper.widthMm;
      const bottom = (width * page.margins.bottom) / paper.widthMm;
      const usable = height - top - bottom;
      const content = sheet.querySelector<HTMLElement>('.sheet-body');
      const contentHeight = content?.scrollHeight ?? 0;
      setPageHeight(height);
      setPages(Math.max(1, Math.ceil(contentHeight / Math.max(usable, 1))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    const body = sheet.querySelector('.sheet-body');
    if (body) observer.observe(body);
    return () => observer.disconnect();
  }, [paper.heightMm, paper.widthMm, page.margins.top, page.margins.bottom]);

  return (
    <div
      ref={sheetRef}
      className={cn('sheet relative mx-auto w-full rounded-[3px] border border-slate-200 bg-paper shadow-doc', className)}
      style={{
        ...sheetStyle(attrs?.page),
        maxWidth: 'var(--sheet-width)',
        minHeight: pageHeight ? pageHeight * pages : undefined,
        aspectRatio: pageHeight ? undefined : `${paper.widthMm} / ${paper.heightMm}`,
      }}
    >
      {!isBandEmpty(attrs?.header) && <BandPreview band={attrs?.header} edge="top" />}
      <div
        className="sheet-body"
        style={{
          paddingTop: 'var(--sheet-margin-top)',
          paddingRight: 'var(--sheet-margin-right)',
          paddingBottom: 'var(--sheet-margin-bottom)',
          paddingLeft: 'var(--sheet-margin-left)',
        }}
      >
        {children}
      </div>
      {!isBandEmpty(attrs?.footer) && <BandPreview band={attrs?.footer} edge="bottom" />}
      {showPageBreaks &&
        pageHeight > 0 &&
        Array.from({ length: pages - 1 }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-300"
            style={{ top: pageHeight * (index + 1) }}
            title="Corte aproximado; la vista previa muestra el corte exacto del PDF"
          >
            <span className="absolute -top-2.5 right-3 rounded bg-slate-100 px-1.5 font-sans text-[10px] text-slate-500">
              Página {index + 2}
            </span>
          </div>
        ))}
    </div>
  );
}

/** Header/footer drawn inside the top or bottom margin, three positions like the PDF. */
function BandPreview({ band, edge }: { band: PageBand | undefined; edge: 'top' | 'bottom' }) {
  if (!band) return null;
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 grid grid-cols-3 items-center gap-2 font-sans text-slate-500',
        edge === 'top' ? 'top-0' : 'bottom-0',
      )}
      style={{
        height: edge === 'top' ? 'var(--sheet-margin-top)' : 'var(--sheet-margin-bottom)',
        paddingLeft: 'var(--sheet-margin-left)',
        paddingRight: 'var(--sheet-margin-right)',
      }}
    >
      <div className="justify-self-start">{band.left && <SlotPreview slot={band.left} />}</div>
      <div className="justify-self-center">{band.center && <SlotPreview slot={band.center} />}</div>
      <div className="justify-self-end">{band.right && <SlotPreview slot={band.right} />}</div>
    </div>
  );
}

const PX_PER_MM = 96 / 25.4;

function SlotPreview({ slot }: { slot: BandSlot }) {
  if (slot.kind === 'text') {
    return <span style={{ fontSize: `${((slot.size ?? 9) * 96) / 72}px` }}>{slot.text}</span>;
  }
  if (slot.kind === 'logo') {
    const height = (slot.height ?? 14) * PX_PER_MM;
    return (
      <span
        className="grid place-items-center rounded border border-dashed border-slate-300 text-slate-400"
        style={{ height, width: height * 2.2 }}
        title="Logo de la institución"
      >
        <ImageIcon className="size-4" />
      </span>
    );
  }
  return <span className="text-[11px]">{slot.format === 'page' ? '1' : 'Página 1 de N'}</span>;
}
