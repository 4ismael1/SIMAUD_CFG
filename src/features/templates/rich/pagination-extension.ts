import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { SHEET_GAP_PX, blockKindOf, planPages, type MeasuredBlock, type PageGeometry } from '../../../lib/rich-doc/pagination';
import { sheetGeometry } from '../../../lib/rich-doc/page';
import type { PageSettings } from '../../../lib/rich-doc/types';

/**
 * Applies the page plan (lib/rich-doc/pagination.ts) inside the editor: blank space is inserted as
 * widget decorations before the blocks that must start on the next page (signatures that would split,
 * headings left alone, content after a page break). Decorations never change the document.
 * The editor measures itself after every change (one frame later) and only redraws when the plan changes.
 */

const paginationKey = new PluginKey<DecorationSet>('pagination');
const SPACER_CLASS = 'page-spacer';

/** Page geometry for the sheet currently on screen (null until the editor sits inside its sheet). */
function geometryOf(view: EditorView): PageGeometry | null {
  const sheet = view.dom.closest('.sheet');
  if (!(sheet instanceof HTMLElement) || sheet.clientWidth === 0) return null;
  const page = (view.state.doc.attrs.page ?? undefined) as PageSettings | undefined;
  const { usable, stride } = sheetGeometry(page, sheet.clientWidth, SHEET_GAP_PX);
  return { usable, stride };
}

function measure(view: EditorView): { positions: number[]; blocks: MeasuredBlock[] } {
  const rootTop = view.dom.getBoundingClientRect().top;
  const positions: number[] = [];
  const elements: HTMLElement[] = [];
  view.state.doc.forEach((_node, offset) => {
    const dom = view.nodeDOM(offset);
    if (dom instanceof HTMLElement) {
      positions.push(offset);
      elements.push(dom);
    }
  });

  // Tops without the spacers currently drawn, so the plan does not depend on itself.
  let inserted = 0;
  const tops = elements.map((element) => {
    const spacer = element.previousElementSibling;
    if (spacer instanceof HTMLElement && spacer.classList.contains(SPACER_CLASS)) inserted += Number(spacer.dataset.height ?? 0);
    return element.getBoundingClientRect().top - rootTop - inserted;
  });
  const contentBottom = view.dom.getBoundingClientRect().bottom - rootTop - inserted;

  const blocks = elements.map((element, index) => ({
    kind: blockKindOf(element),
    top: tops[index],
    height: (index + 1 < tops.length ? tops[index + 1] : contentBottom) - tops[index],
  }));
  return { positions, blocks };
}

function spacerWidget(height: number) {
  return () => {
    const element = document.createElement('div');
    element.className = SPACER_CLASS;
    element.dataset.height = String(height);
    element.style.height = `${height}px`;
    element.contentEditable = 'false';
    element.setAttribute('aria-hidden', 'true');
    return element;
  };
}

export const Pagination = Extension.create({
  name: 'pagination',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => tr.getMeta(paginationKey) ?? set.map(tr.mapping, tr.doc),
        },
        props: {
          decorations: (state) => paginationKey.getState(state),
        },
        view: (view) => {
          let frame = 0;
          let lastPlan = '';
          let observed: Element | null = null;
          let retries = 0;
          const observer = new ResizeObserver(() => schedule());
          const run = () => {
            if (view.isDestroyed) return;
            // The editor is placed inside its sheet after mounting: start watching the sheet's size then.
            const sheet = view.dom.closest('.sheet');
            if (sheet && sheet !== observed) {
              observer.disconnect();
              observer.observe(sheet);
              observed = sheet;
            }
            const geometry = geometryOf(view);
            if (!geometry) {
              // Not inside its sheet yet (React mounts the editor first): try again on the next frames.
              if (retries++ < 120) schedule();
              return;
            }
            retries = 0;
            const { positions, blocks } = measure(view);
            const plan = planPages(blocks, geometry);
            const entries = [...plan.spacers].map(([index, height]) => [positions[index], Math.round(height)] as const);
            const signature = JSON.stringify(entries);
            if (signature === lastPlan) return;
            lastPlan = signature;
            const decorations = entries.map(([position, height]) =>
              Decoration.widget(position, spacerWidget(height), { side: -1, key: `page-${position}-${height}`, ignoreSelection: true }),
            );
            view.dispatch(view.state.tr.setMeta(paginationKey, DecorationSet.create(view.state.doc, decorations)).setMeta('addToHistory', false));
          };
          function schedule() {
            window.clearTimeout(frame);
            // A short timeout (not requestAnimationFrame, which does not run in hidden tabs) batches bursts of typing.
            frame = window.setTimeout(run, 60);
          }
          schedule();
          return {
            update: schedule,
            destroy: () => {
              window.clearTimeout(frame);
              observer.disconnect();
            },
          };
        },
      }),
    ];
  },
});
