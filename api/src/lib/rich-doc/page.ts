import type { TDocumentDefinitions, Content } from "pdfmake/interfaces.js";
import type { PageSettings, PageBand, BandSlot } from "./types.js";

export const mmToPt = (value: number) => (value * 72) / 25.4;
// hhea ascent - descent, in em, from the bundled fonts. CSS line-height uses fontSize instead.
export const FONT_LINE_METRICS = { serif: 1.371, sans: 1.3 };
export const DEFAULT_PAGE: Required<PageSettings> = {
  size: "letter",
  margins: { top: 25, right: 25, bottom: 25, left: 25 },
  font: "serif",
  fontSize: 11,
  lineHeight: 1.5,
};
export const PAPER_SIZES = {
  letter: { width: mmToPt(215.9), height: mmToPt(279.4) },
  legal: { width: mmToPt(215.9), height: mmToPt(355.6) },
  a4: { width: mmToPt(210), height: mmToPt(297) },
};

export function resolvePage(page?: PageSettings): Required<PageSettings> {
  return { ...DEFAULT_PAGE, ...page, margins: { ...DEFAULT_PAGE.margins, ...page?.margins } };
}

function slotContent(
  slot: BandSlot | undefined,
  page: number,
  pages: number,
  logo?: string | null,
  width = 120,
): Content {
  if (!slot) return { text: "" };
  if (slot.kind === "logo")
    return logo ? { image: logo, fit: [width, mmToPt(slot.height ?? 14)] } : { text: "" };
  if (slot.kind === "text") return { text: slot.text, fontSize: slot.size ?? 9 };
  return {
    text: slot.format === "page" ? String(page) : `Página ${page} de ${pages}`,
    fontSize: 8.25,
  };
}

function bandContent(
  band: PageBand | undefined,
  page: Required<PageSettings>,
  logo?: string | null,
  edge: "top" | "bottom" = "top",
): TDocumentDefinitions["header"] {
  if (!band) return undefined;
  return (number, total) => {
    if (number === 1 && band.skipFirstPage) return { text: "" };
    const slotWidth =
      (PAPER_SIZES[page.size].width - mmToPt(page.margins.left + page.margins.right)) / 3;
    return {
      table: {
        widths: ["*", "*", "*"],
        heights: mmToPt(page.margins[edge]),
        body: [
          (["left", "center", "right"] as const).map((alignment) => ({
            stack: [slotContent(band[alignment], number, total, logo, slotWidth)],
            alignment,
            verticalAlignment: "middle" as const,
          })),
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [mmToPt(page.margins.left), 0, mmToPt(page.margins.right), 0],
      font: "Geist",
      color: "#64748b",
      lineHeight: 1.5 / FONT_LINE_METRICS.sans,
    };
  };
}

export function pageOptions(
  page?: PageSettings,
  header?: PageBand,
  footer?: PageBand,
  logo?: string | null,
): Partial<TDocumentDefinitions> {
  const resolved = resolvePage(page);
  const margins = resolved.margins;
  return {
    pageSize: { ...PAPER_SIZES[resolved.size] },
    pageMargins: [margins.left, margins.top, margins.right, margins.bottom].map(mmToPt) as [
      number,
      number,
      number,
      number,
    ],
    defaultStyle: {
      font: resolved.font === "sans" ? "Geist" : "SourceSerif",
      fontSize: resolved.fontSize,
      lineHeight: resolved.lineHeight / FONT_LINE_METRICS[resolved.font],
    },
    header: bandContent(header, resolved, logo),
    footer: bandContent(footer, resolved, logo, "bottom"),
  };
}
