import type { Content, ContentStack } from "pdfmake/interfaces.js";
import type { RichDoc, RichNode } from "./types.js";

export interface PdfSigner {
  signingOrder: number;
  name: string;
  cedula: string | null;
  signedAt: Date | null;
  image?: string;
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
  const stack: Content[] = [{ text: "", margin: [0, 0, 0, 42] }];
  if (signer?.image)
    stack.unshift({
      image: signer.image,
      fit: [width * 0.8, 42],
      alignment: "center",
      relativePosition: { x: 0, y: 0 },
    });
  stack.push({
    canvas: [{ type: "line", x1: width * 0.1, x2: width * 0.9, y1: 0, y2: 0, lineWidth: 0.6 }],
  });
  if (slot.attrs?.showName !== false)
    stack.push({ text: signer?.name ?? `[Firmante ${number}]`, margin: [0, 4.5, 0, 0] });
  if (slot.attrs?.showId !== false) stack.push({ text: "C.I. " + (signer?.cedula ?? "[cédula]") });
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
  return { stack, alignment: "center", fontSize: fontSize * 0.9, lineHeight: 1.375 / lineMetric };
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
