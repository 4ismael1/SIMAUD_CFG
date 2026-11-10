import { placeSignature, type SignaturePlacement } from "../signature-placement.js";
import { formatCedula } from "../validation/format-cedula.js";
import { resolvePage, PAPER_SIZES, mmToPt } from "./page.js";
import type { Content, ContentStack } from "pdfmake/interfaces.js";
import type { RichDoc, RichNode } from "./types.js";

export interface PdfSigner {
  signingOrder: number;
  name: string;
  cedula: string | null;
  signedAt: Date | null;
  image?: string;
  placement?: SignaturePlacement | null;
}

export function withSignatureSlots(document: RichDoc, signerCount: number): RichDoc {
  const copy = structuredClone(document);
  const blocks = copy.content.filter((block) => block.type === "signatures");
  const count = blocks.reduce((total, block) => total + block.content!.length, 0);
  if (signerCount <= count) return copy;
  let last = blocks.at(-1);
  if (!last) {
    last = { type: "signatures", content: [] };
    copy.content.push(last);
  }
  for (let index = count; index < signerCount; index++)
    last.content!.push({ type: "signatureSlot", attrs: { label: "" } });
  return copy;
}

function signatureCell(
  slot: RichNode,
  number: number,
  signer: PdfSigner | undefined,
  width: number,
  fontSize: number,
  lineMetric: number,
): ContentStack {
  const anchor = {
    id: `signature-slot-${number}`,
    text: "\u200b",
    fontSize: 0.001,
    lineHeight: 0.001,
    alignment: "left" as const,
    relativePosition: { x: 0, y: 0 },
  };
  const stack: Content[] = [anchor, { text: "", margin: [0, 0, 0, 42] }];
  if (signer?.image) {
    const bytes = Buffer.from(signer.image.split(",")[1]!, "base64");
    const placed = placeSignature(
      bytes.readUInt32BE(16),
      bytes.readUInt32BE(20),
      width * 0.8,
      42,
      signer.placement ?? undefined,
    );
    stack.splice(1, 0, {
      image: signer.image,
      width: placed.width,
      height: placed.height,
      relativePosition: { x: width * 0.1 + placed.left, y: placed.top },
      alignment: "left",
    });
  }
  stack.push({
    canvas: [{ type: "line", x1: width * 0.1, x2: width * 0.9, y1: 0, y2: 0, lineWidth: 0.6 }],
  });
  if (slot.attrs?.showName !== false)
    stack.push({ text: signer?.name ?? `[Firmante ${number}]`, margin: [0, 4.5, 0, 0] });
  if (slot.attrs?.showId !== false)
    stack.push({ text: "C.I. " + (signer?.cedula ? formatCedula(signer.cedula) : "[cédula]") });
  if (signer?.signedAt)
    stack.push({
      text: new Intl.DateTimeFormat("es-DO", {
        timeZone: "America/Santo_Domingo",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(signer.signedAt),
      fontSize: Math.min(fontSize * 0.9, 8),
    });
  if (slot.attrs?.label) stack.push({ text: slot.attrs.label, bold: true });
  return {
    stack,
    alignment: "center",
    fontSize: fontSize * 0.9,
    lineHeight: 1.375 / lineMetric,
  };
}

export function signatureContent(
  node: RichNode,
  start: number,
  signers: PdfSigner[],
  contentWidth: number,
  fontSize: number,
  lineMetric: number,
): Content {
  const columns = node.attrs?.columns ?? 2;
  const width = (contentWidth - (columns - 1) * 24) / columns;
  const rows: Content[] = [];
  for (let index = 0; index < node.content!.length; index += columns) {
    rows.push({
      columns: Array.from({ length: columns }, (_, column) => {
        const slot = node.content![index + column];
        const number = start + index + column;
        return slot
          ? signatureCell(slot, number, signers[number - 1], width, fontSize, lineMetric)
          : { text: "" };
      }),
      columnGap: 24,
      margin: [0, 0, 0, index + columns < node.content!.length ? 18 : 0],
    });
  }
  return { stack: rows, unbreakable: true, margin: [0, 18, 0, 18] };
}

export function signatureSlotSizes(document: RichDoc, count: number) {
  const source = withSignatureSlots(document, count);
  const page = resolvePage(source.attrs?.page);
  const paper = PAPER_SIZES[page.size];
  const contentWidth = paper.width - mmToPt(page.margins.left + page.margins.right);
  return source.content
    .filter((node) => node.type === "signatures")
    .flatMap((node) => {
      const columns = node.attrs?.columns ?? 2;
      const cellWidth = (contentWidth - (columns - 1) * 24) / columns;
      return node.content!.map(() => ({ width: cellWidth * 0.8, height: 42, cellWidth, paper }));
    });
}
export interface SignatureSlotGeometry {
  page: number;
  slotIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
