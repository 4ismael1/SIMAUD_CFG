import type { Content, ContentBase, TDocumentDefinitions } from "pdfmake/interfaces.js";
import { makePdf } from "../pdf.js";
import { ApiError } from "../errors.js";
import { PAPER_SIZES, mmToPt, resolvePage } from "./page.js";
import type { RichDoc } from "./types.js";

function cloneLayout<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneLayout) as T;
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneLayout(child)]),
    ) as T;
  return value;
}

// Measure with the actual embedded fonts and pdfmake's line/table layout, not character estimates.
export async function measureBlocks(
  content: Content[],
  options: Partial<TDocumentDefinitions>,
  width: number,
): Promise<number[]> {
  const positions: number[] = [];
  const measured: Content[] = [];
  content.forEach((block, index) => {
    measured.push({ text: "\u200b", fontSize: 0.001, lineHeight: 0.001, id: `measure-${index}` });
    const copy = cloneLayout(block);
    if (typeof copy === "object" && !Array.isArray(copy)) {
      delete (copy as ContentBase).pageBreak;
      delete (copy as ContentBase).unbreakable;
    }
    measured.push(copy);
  });
  measured.push({
    text: "\u200b",
    fontSize: 0.001,
    lineHeight: 0.001,
    id: `measure-${content.length}`,
  });
  await makePdf(measured, "Medición", {
    ...options,
    pageSize: { width, height: Infinity },
    header: undefined,
    footer: undefined,
    pageBreakBefore: (node) => {
      if (node.id?.startsWith("measure-"))
        positions[Number(node.id.slice(8))] = node.startPosition.top;
      return false;
    },
  });
  return content.map((_, index) => positions[index + 1]! - positions[index]!);
}

export async function paginateBlocks(
  document: RichDoc,
  content: Content[],
  options: Partial<TDocumentDefinitions>,
) {
  const page = resolvePage(document.attrs?.page);
  const paper = PAPER_SIZES[page.size];
  const usable = paper.height - mmToPt(page.margins.top + page.margins.bottom);
  const heights = await measureBlocks(content, options, paper.width);
  content.forEach((block, index) => {
    if (typeof block !== "object" || Array.isArray(block)) return;
    const kind = document.content[index]?.type;
    if (kind === "signatures" && heights[index]! > usable)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "El bloque de firmas supera una página. Usa más columnas o distribuye las casillas en varios bloques.",
      );
    (block as ContentBase).unbreakable = kind !== "pageBreak" && heights[index]! <= usable;
    if (kind === "pageBreak") {
      delete (block as ContentBase).pageBreak;
      const next = content[index + 1];
      if (next && typeof next === "object" && !Array.isArray(next))
        (next as ContentBase).pageBreak = "before";
    }
  });
  const pageBreakBefore: TDocumentDefinitions["pageBreakBefore"] = (node, queries) => {
    if (!node.id?.startsWith("block-")) return false;
    const index = Number(node.id.slice(6));
    const kind = document.content[index]?.type;
    let needed = heights[index]!;
    if (kind === "heading") needed += Math.min(heights[index + 1] ?? 0, 36);
    else if (document.content[index + 1]?.type === "signatures" && kind !== "pageBreak")
      needed += heights[index + 1]!;
    else return false;
    const position = node.startPosition;
    const remaining = usable * (1 - position.verticalRatio);
    if (kind === "heading" && heights[index]! <= usable && position.verticalRatio > 0.001) {
      const next = [...queries.getFollowingNodesOnPage(), ...queries.getNodesOnNextPage()].find(
        (candidate) => candidate.id === `block-${index + 1}`,
      );
      if (next && next.startPosition.pageNumber > position.pageNumber) return true;
    }
    return needed <= usable && needed > remaining + 0.375 && position.verticalRatio > 0.001;
  };
  return { content, pageBreakBefore };
}
