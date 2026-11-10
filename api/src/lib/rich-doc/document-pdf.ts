import type { Content, TDocumentDefinitions } from "pdfmake/interfaces.js";
import { makePdf, paragraphs } from "../pdf.js";
import { richDocPdf } from "./pdf.js";
import { pageOptions, resolvePage, PAPER_SIZES, mmToPt } from "./page.js";
import { paginateBlocks, measureBlocks } from "./pagination.js";
import { ApiError } from "../errors.js";
import {
  signatureLayout,
  type PdfSigner,
  signatureSlotSizes,
  type SignatureSlotGeometry,
} from "./signatures.js";
import type { RichDoc } from "./types.js";

async function assertBandsFit(document: RichDoc, options: Partial<TDocumentDefinitions>) {
  const page = resolvePage(document.attrs?.page);
  const paper = PAPER_SIZES[page.size];
  for (const [edge, margin] of [
    ["header", "top"],
    ["footer", "bottom"],
  ] as const) {
    const band = options[edge];
    if (typeof band !== "function") continue;
    const content = band(2, 2, { ...paper, orientation: "portrait" });
    if (content == null) continue;
    const [height] = await measureBlocks(
      [content],
      { ...options, pageMargins: [0, 0, 0, 0] },
      paper.width,
    );
    if (height! > mmToPt(page.margins[margin]) + 0.01)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        `El ${edge === "header" ? "encabezado" : "pie"} supera su margen. Aumenta el margen o reduce el tamaño del contenido.`,
      );
  }
}

export async function documentPdf(
  document: RichDoc,
  title: string,
  options: {
    signers?: PdfSigner[];
    logo?: string | null;
    appendix?: Content[];
    onSignatureSlot?: (geometry: SignatureSlotGeometry) => void;
  } = {},
) {
  const { document: source, signers } = signatureLayout(document, options.signers ?? []);
  const settings = pageOptions(
    source.attrs?.page,
    source.attrs?.header,
    source.attrs?.footer,
    options.logo,
  );
  const content = richDocPdf(source, {
    signers,
    matchEditor: true,
  });
  await assertBandsFit(source, settings);
  const paginated = await paginateBlocks(source, content, settings);
  const slots = signatureSlotSizes(source, 0);
  return makePdf([...paginated.content, ...(options.appendix ?? [])], title, {
    ...settings,
    pageBreakBefore: (node, queries) => {
      if (node.id?.startsWith("signature-slot-")) {
        const index = Number(node.id.slice(15)) - 1;
        const slot = slots[index];
        if (slot)
          options.onSignatureSlot?.({
            page: node.startPosition.pageNumber,
            slotIndex: index,
            x: (node.startPosition.left + slot.cellWidth * 0.1) / slot.paper.width,
            y: node.startPosition.top / slot.paper.height,
            width: slot.width / slot.paper.width,
            height: slot.height / slot.paper.height,
          });
      }
      return paginated.pageBreakBefore?.(node, queries) ?? false;
    },
  });
}

export function plainDocument(text: string): RichDoc {
  const content = paragraphs(text).map((block) => {
    if (typeof block !== "object" || Array.isArray(block) || !("text" in block))
      throw new Error("Párrafo plano inválido.");
    const parts = block.text as { text: string; bold: boolean }[];
    return {
      type: "paragraph",
      content: parts
        .filter((part) => part.text)
        .map((part) => ({
          type: "text",
          text: part.text,
          ...(part.bold ? { marks: [{ type: "bold" as const }] } : {}),
        })),
    };
  });
  return { type: "doc", content };
}
