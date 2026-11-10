import type { CSSProperties } from 'react';
import type { DocumentFont, PageBand, PageMargins, PageSettings, PaperSize } from './types';

/**
 * Page set-up shared by the editor and every read-only view (docs/RICH_DOC_FORMAT_V2.md).
 * The PDF (API, task T15) uses the same values, so the sheet on screen and the printed page match.
 */

export const PAPER_SIZES: Record<PaperSize, { label: string; detail: string; widthMm: number; heightMm: number }> = {
  letter: { label: 'Carta', detail: '21,6 × 27,9 cm', widthMm: 215.9, heightMm: 279.4 },
  legal: { label: 'Oficio (Legal)', detail: '21,6 × 35,6 cm', widthMm: 215.9, heightMm: 355.6 },
  a4: { label: 'A4', detail: '21 × 29,7 cm', widthMm: 210, heightMm: 297 },
};

export const FONTS: Record<DocumentFont, { label: string; css: string }> = {
  serif: { label: 'Serif (Source Serif)', css: 'var(--font-serif)' },
  sans: { label: 'Sans (Geist)', css: 'var(--font-sans)' },
};

export const FONT_SIZES = [10, 10.5, 11, 11.5, 12, 13, 14] as const;
export const LINE_HEIGHTS = [1, 1.15, 1.5, 2] as const;

export const MARGIN_PRESETS: { label: string; margins: PageMargins }[] = [
  { label: 'Normal (2,5 cm)', margins: { top: 25, right: 25, bottom: 25, left: 25 } },
  { label: 'Estrecho (1,3 cm)', margins: { top: 13, right: 13, bottom: 13, left: 13 } },
  { label: 'Moderado', margins: { top: 25, right: 19, bottom: 25, left: 19 } },
  { label: 'Amplio (3,8 cm)', margins: { top: 25, right: 38, bottom: 25, left: 38 } },
];

export const MARGIN_RANGE = { min: 10, max: 50 } as const;

export const DEFAULT_PAGE: Required<PageSettings> = {
  size: 'letter',
  margins: { top: 25, right: 25, bottom: 25, left: 25 },
  font: 'serif',
  fontSize: 11,
  lineHeight: 1.5,
};

export function resolvePage(page: PageSettings | undefined): Required<PageSettings> {
  return {
    size: page?.size ?? DEFAULT_PAGE.size,
    margins: { ...DEFAULT_PAGE.margins, ...page?.margins },
    font: page?.font ?? DEFAULT_PAGE.font,
    fontSize: page?.fontSize ?? DEFAULT_PAGE.fontSize,
    lineHeight: page?.lineHeight ?? DEFAULT_PAGE.lineHeight,
  };
}

/** Keep only values that differ from the defaults (canonical, smaller documents). */
export function compactPage(page: Required<PageSettings>): PageSettings | undefined {
  const out: PageSettings = {};
  if (page.size !== DEFAULT_PAGE.size) out.size = page.size;
  const m = page.margins;
  const d = DEFAULT_PAGE.margins;
  if (m.top !== d.top || m.right !== d.right || m.bottom !== d.bottom || m.left !== d.left) out.margins = m;
  if (page.font !== DEFAULT_PAGE.font) out.font = page.font;
  if (page.fontSize !== DEFAULT_PAGE.fontSize) out.fontSize = page.fontSize;
  if (page.lineHeight !== DEFAULT_PAGE.lineHeight) out.lineHeight = page.lineHeight;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function isBandEmpty(band: PageBand | undefined): boolean {
  return !band || (!band.left && !band.center && !band.right);
}

const PX_PER_MM = 96 / 25.4;
const PX_PER_PT = 96 / 72;

/**
 * CSS variables for a sheet. Margins are percentages of the paper width so the whole page scales down
 * proportionally on narrow screens; font size scales with the same factor through `--sheet-scale`.
 */
export function sheetStyle(page: PageSettings | undefined): CSSProperties {
  const resolved = resolvePage(page);
  const paper = PAPER_SIZES[resolved.size];
  const percent = (mm: number) => `${((mm / paper.widthMm) * 100).toFixed(3)}%`;
  return {
    '--sheet-width': `${(paper.widthMm * PX_PER_MM).toFixed(1)}px`,
    '--sheet-ratio': `${paper.widthMm} / ${paper.heightMm}`,
    '--sheet-height-ratio': (paper.heightMm / paper.widthMm).toFixed(5),
    '--sheet-margin-top': percent(resolved.margins.top),
    '--sheet-margin-right': percent(resolved.margins.right),
    '--sheet-margin-bottom': percent(resolved.margins.bottom),
    '--sheet-margin-left': percent(resolved.margins.left),
    '--sheet-font': FONTS[resolved.font].css,
    '--sheet-font-size': `${(resolved.fontSize * PX_PER_PT).toFixed(2)}px`,
    '--sheet-line-height': String(resolved.lineHeight),
  } as CSSProperties;
}
