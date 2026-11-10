/**
 * Page planning shared by the editor and the read-only views (the PDF in task T15 applies the same rules).
 *
 * The document is laid out as separate sheets, one below the other with a gap between them (like a
 * word processor). Content coordinates start at the top margin of page 1; page k's writable area is
 * [k·stride, k·stride + usable], where stride = sheet height + gap and the rest is bottom margin, gap
 * and next top margin. Rules:
 *  - a block that fits in one page never splits: if it does not fit in what is left, it moves whole
 *    to the next page (so every page end falls between blocks and the gap can be drawn);
 *  - a heading (clause title) never stays alone at the bottom: it moves with the start of the next block;
 *  - after a page break, the next block starts on a new page;
 *  - only a block taller than a whole page continues across pages.
 */

export type PageBlockKind = 'signatures' | 'heading' | 'pageBreak' | 'other';

export interface MeasuredBlock {
  kind: PageBlockKind;
  /** Top of the block in content coordinates, WITHOUT any inserted space (px). */
  top: number;
  /** Height including its own spacing up to the next block (px). */
  height: number;
}

export interface PageGeometry {
  /** Writable height of one page (px). */
  usable: number;
  /** Distance between the tops of two consecutive pages' writable areas (px). */
  stride: number;
}

export interface PagePlan {
  /** Blank space to insert before block i (only entries > 0). */
  spacers: Map<number, number>;
  pages: number;
}

/** How much of the next block must fit with a heading so it is not left alone (about two lines). */
const KEEP_WITH_NEXT_PX = 48;
const EPSILON = 0.5;

export function planPages(blocks: MeasuredBlock[], { usable, stride }: PageGeometry): PagePlan {
  const spacers = new Map<number, number>();
  if (usable <= 0 || stride < usable || blocks.length === 0) return { spacers, pages: 1 };

  let offset = 0;
  let forceNextPage = false;
  let lastBottom = 0;

  blocks.forEach((block, index) => {
    let top = block.top + offset;
    let page = Math.floor((top + EPSILON) / stride);
    const pageStart = (n: number) => n * stride;
    const pageEnd = (n: number) => n * stride + usable;

    // A block starting inside the gap belongs to the next page.
    if (top > pageEnd(page) - EPSILON) page += 1;
    let target = Math.max(top, pageStart(page));

    const needed =
      block.kind === 'heading' ? block.height + Math.min(blocks[index + 1]?.height ?? 0, KEEP_WITH_NEXT_PX) : block.height;
    const startsPage = target - pageStart(page) < EPSILON;
    if (forceNextPage && !startsPage) {
      page += 1;
      target = pageStart(page);
    } else if (target + needed > pageEnd(page) + EPSILON && needed <= usable && !startsPage) {
      page += 1;
      target = pageStart(page);
    }

    const push = target - top;
    if (push > EPSILON) {
      spacers.set(index, push);
      offset += push;
      top = target;
    }
    forceNextPage = block.kind === 'pageBreak';
    lastBottom = top + block.height;
  });

  return { spacers, pages: Math.max(1, Math.floor((lastBottom - EPSILON) / stride) + 1) };
}

/** Kind of a rendered block element (editor and read-only views use the same tags/attributes). */
export function blockKindOf(element: Element): PageBlockKind {
  if (element.matches('[data-signatures], .signatures-block, .node-signatures')) return 'signatures';
  if (element.matches('[data-page-break]')) return 'pageBreak';
  if (/^H[1-6]$/.test(element.tagName)) return 'heading';
  return 'other';
}

/** Gap between two sheets on screen (px). */
export const SHEET_GAP_PX = 28;
