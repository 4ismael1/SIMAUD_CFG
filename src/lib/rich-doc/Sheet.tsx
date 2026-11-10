import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ImageIcon } from 'lucide-react';
import { cn } from '../../ui';
import { isBandEmpty, sheetGeometry, sheetStyle, type SheetGeometry } from './page';
import { SHEET_GAP_PX, blockKindOf, planPages } from './pagination';
import type { BandSlot, DocAttrs, PageBand } from './types';

/**
 * The document drawn as separate sheets of paper (real size, margins, font), one below the other with
 * a gap, and the header/footer repeated on every sheet — like a word processor. Used by the editor and
 * by every read-only view, so the screen matches the PDF.
 *
 * Page ends follow lib/rich-doc/pagination.ts. In the editor the blank space before a block that
 * moves to the next page is inserted by the Pagination extension (`managed`); in read-only views this
 * component inserts it itself as top margin on the block.
 */

interface SheetProps {
  attrs: DocAttrs | undefined;
  children: ReactNode;
  /** True in the editor: its Pagination extension inserts the page spacing. */
  managed?: boolean;
  className?: string;
}

const PUSH_ATTRIBUTE = 'data-page-push';
const BASE_ATTRIBUTE = 'data-page-base';

export function Sheet({ attrs, children, managed = false, className }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ geometry: SheetGeometry; pages: number } | null>(null);
  const page = attrs?.page;

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const body = bodyRef.current;
    if (!sheet || !body) return;
    let frame = 0;

    const run = () => {
      const geometry = sheetGeometry(page, sheet.clientWidth, SHEET_GAP_PX);
      if (!managed) paginateReadOnly(body, geometry);
      const contentHeight = body.scrollHeight - geometry.marginTop;
      const pages = Math.max(1, Math.floor((Math.max(contentHeight, 1) - 0.5) / geometry.stride) + 1);
      setLayout((previous) =>
        previous && previous.pages === pages && previous.geometry.stride === geometry.stride && previous.geometry.usable === geometry.usable
          ? previous
          : { geometry, pages },
      );
    };
    const schedule = () => {
      window.clearTimeout(frame);
      frame = window.setTimeout(run, 60);
    };
    run();
    const resize = new ResizeObserver(schedule);
    resize.observe(sheet);
    resize.observe(body);
    // Content changes (typing, data arriving, the editor inserting page spacing) → recount the pages.
    const mutations = new MutationObserver(schedule);
    mutations.observe(body, { childList: true, subtree: true, characterData: true });
    return () => {
      window.clearTimeout(frame);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [page, managed]);

  const geometry = layout?.geometry;
  const pages = layout?.pages ?? 1;
  const totalHeight = geometry ? pages * geometry.pageHeight + (pages - 1) * SHEET_GAP_PX : undefined;

  return (
    <div
      ref={sheetRef}
      className={cn('sheet relative mx-auto w-full', className)}
      style={{ ...sheetStyle(page), maxWidth: 'var(--sheet-width)', minHeight: totalHeight, aspectRatio: geometry ? undefined : 'var(--sheet-ratio)' }}
    >
      {/* The paper: one sheet per page, behind the text. */}
      {geometry &&
        Array.from({ length: pages }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="absolute inset-x-0 rounded-[3px] border border-slate-200 bg-paper shadow-doc"
            style={{ top: index * geometry.stride, height: geometry.pageHeight }}
          >
            {!isBandEmpty(attrs?.header) && !(index === 0 && attrs?.header?.skipFirstPage) && (
              <BandPreview band={attrs?.header} edge="top" geometry={geometry} page={index + 1} pages={pages} />
            )}
            {!isBandEmpty(attrs?.footer) && !(index === 0 && attrs?.footer?.skipFirstPage) && (
              <BandPreview band={attrs?.footer} edge="bottom" geometry={geometry} page={index + 1} pages={pages} />
            )}
            {pages > 1 && (
              <span className="absolute -bottom-[22px] left-1/2 -translate-x-1/2 font-sans text-[11px] text-slate-400">
                Página {index + 1} de {pages}
              </span>
            )}
          </div>
        ))}
      <div
        ref={bodyRef}
        className="sheet-body relative"
        style={{
          paddingTop: 'var(--sheet-margin-top)',
          paddingRight: 'var(--sheet-margin-right)',
          paddingBottom: 'var(--sheet-margin-bottom)',
          paddingLeft: 'var(--sheet-margin-left)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Read-only views: measure the blocks and push the ones that start a new page, as the editor does. */
function paginateReadOnly(body: HTMLElement, geometry: SheetGeometry) {
  const content = body.querySelector<HTMLElement>(':scope > .rich-content, :scope .rich-content');
  if (!content) return;
  const elements = Array.from(content.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  const rootTop = body.getBoundingClientRect().top + geometry.marginTop;

  // Natural positions: remove what we pushed last time from the measurements. The push is padding INSIDE
  // the block, so it moves the blocks after it but not the block's own top edge: subtract it only after
  // measuring that block (subtracting it before made a pushed block look as if it fitted, so it bounced).
  let inserted = 0;
  const tops = elements.map((element) => {
    const top = element.getBoundingClientRect().top - rootTop - inserted;
    inserted += Number(element.getAttribute(PUSH_ATTRIBUTE) ?? 0);
    return top;
  });
  const bottom = content.getBoundingClientRect().bottom - rootTop - inserted;
  const blocks = elements.map((element, index) => ({
    kind: blockKindOf(element),
    top: tops[index],
    height: (index + 1 < tops.length ? tops[index + 1] : bottom) - tops[index],
  }));
  const plan = planPages(blocks, geometry);

  elements.forEach((element, index) => {
    const push = Math.round(plan.spacers.get(index) ?? 0);
    const previous = Number(element.getAttribute(PUSH_ATTRIBUTE) ?? 0);
    if (push === previous) return;
    // Padding (not margin): margins collapse between blocks and would make the push inexact.
    if (!element.hasAttribute(BASE_ATTRIBUTE)) element.setAttribute(BASE_ATTRIBUTE, String(parseFloat(getComputedStyle(element).paddingTop) || 0));
    const base = Number(element.getAttribute(BASE_ATTRIBUTE));
    if (push > 0) element.setAttribute(PUSH_ATTRIBUTE, String(push));
    else element.removeAttribute(PUSH_ATTRIBUTE);
    element.style.paddingTop = push > 0 ? `${base + push}px` : '';
  });
}

/** Header/footer inside the top or bottom margin of a sheet, three positions like the PDF. */
function BandPreview({ band, edge, geometry, page, pages }: { band: PageBand | undefined; edge: 'top' | 'bottom'; geometry: SheetGeometry; page: number; pages: number }) {
  if (!band) return null;
  return (
    <div
      className={cn('absolute inset-x-0 grid grid-cols-3 items-center gap-2 font-sans text-slate-500', edge === 'top' ? 'top-0' : 'bottom-0')}
      style={{
        height: edge === 'top' ? geometry.marginTop : geometry.marginBottom,
        paddingLeft: geometry.marginLeft,
        paddingRight: geometry.marginRight,
      }}
    >
      <div className="justify-self-start">{band.left && <SlotPreview slot={band.left} page={page} pages={pages} />}</div>
      <div className="justify-self-center">{band.center && <SlotPreview slot={band.center} page={page} pages={pages} />}</div>
      <div className="justify-self-end">{band.right && <SlotPreview slot={band.right} page={page} pages={pages} />}</div>
    </div>
  );
}

const PX_PER_MM = 96 / 25.4;

function SlotPreview({ slot, page, pages }: { slot: BandSlot; page: number; pages: number }) {
  if (slot.kind === 'text') {
    return <span style={{ fontSize: `${((slot.size ?? 9) * 96) / 72}px` }}>{slot.text}</span>;
  }
  if (slot.kind === 'logo') {
    const height = (slot.height ?? 14) * PX_PER_MM;
    return (
      <span className="grid place-items-center rounded border border-dashed border-slate-300 text-slate-400" style={{ height, width: height * 2.2 }} title="Logo de la institución">
        <ImageIcon className="size-4" />
      </span>
    );
  }
  return <span className="text-[11px]">{slot.format === 'page' ? page : `Página ${page} de ${pages}`}</span>;
}
