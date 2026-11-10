import type { Content, ContentBase, ContentText, TableCell } from "pdfmake/interfaces.js";
import type { RichDoc, RichNode } from "./types.js";
import { tableGrid } from "./table.js";
import { resolvePage, PAPER_SIZES, mmToPt, FONT_LINE_METRICS } from "./page.js";
import { clauseNumber } from "./numbering.js";
import { signatureContent, withSignatureSlots, type PdfSigner } from "./signatures.js";

interface RenderContext {
  fontSize?: number;
  lineMetric: number;
  width: number;
  counters: number[];
  signatureIndex: number;
  signers: PdfSigner[];
}

function inlineContent(node: RichNode): ContentText {
  const text =
    node.type === "hardBreak"
      ? "\n"
      : node.type === "variable"
        ? "{{" + node.attrs!.name + "}}"
        : node.text!;
  const marks = new Set(node.marks?.map((mark) => mark.type));
  const decoration: ("underline" | "lineThrough")[] = [];
  if (marks.has("underline")) decoration.push("underline");
  if (marks.has("strike")) decoration.push("lineThrough");
  return {
    text,
    ...(marks.has("bold") ? { bold: true } : {}),
    ...(marks.has("italic") ? { italics: true } : {}),
    ...(decoration.length ? { decoration } : {}),
    ...(marks.has("superscript") ? { sup: true } : {}),
    ...(marks.has("subscript") ? { sub: true } : {}),
    ...(marks.has("highlight") ? { background: "#fff59d" } : {}),
    preserveLeadingSpaces: true,
  };
}

function headingInline(node: RichNode, uppercase: boolean): ContentText {
  const content = inlineContent(node);
  return uppercase && typeof content.text === "string"
    ? { ...content, text: content.text.toLocaleUpperCase("es-DO") }
    : content;
}

function tableContent(node: RichNode, context: RenderContext): Content {
  const { positions, width } = tableGrid(node);
  const body: TableCell[][] = node.content!.map(() => Array.from({ length: width }, () => ({})));
  for (const { cell, row, column } of positions) {
    body[row]![column] = {
      stack: cell.content!.map((child) => blockContent(child, context)),
      colSpan: cell.attrs?.colspan ?? 1,
      rowSpan: cell.attrs?.rowspan ?? 1,
      ...(cell.type === "tableHeader" ? { bold: true, fillColor: "#eeeeee" } : {}),
    };
  }
  let headerRows = 0;
  for (const row of node.content!) {
    if (!row.content?.length || row.content.some((cell) => cell.type !== "tableHeader")) break;
    headerRows++;
  }
  return {
    table: { widths: Array<string>(width).fill("*"), body, headerRows: Math.min(headerRows, 1) },
    fontSize: (context.fontSize ?? 11) * 0.93,
    ...(node.attrs?.borderless
      ? { layout: "noBorders" }
      : context.fontSize
        ? {
            layout: {
              paddingLeft: () => 7.5,
              paddingRight: () => 7.5,
              paddingTop: () => 4.5,
              paddingBottom: () => 4.5,
              hLineWidth: () => 0.75,
              vLineWidth: () => 0.75,
              hLineColor: () => "#cbd5e1",
              vLineColor: () => "#cbd5e1",
            },
          }
        : {}),
    margin: context.fontSize ? [0, 9, 0, 0] : [0, 4, 0, 10],
  };
}

function blockContent(node: RichNode, context: RenderContext): Content {
  const render = (child: RichNode) => blockContent(child, context);
  const prefix =
    node.type === "heading" && node.attrs?.numbered
      ? clauseNumber(++context.counters[node.attrs.level! - 1]!, node.attrs.numbered) + " "
      : "";
  switch (node.type) {
    case "paragraph":
    case "heading":
      return {
        text: [
          ...(prefix ? [{ text: prefix }] : []),
          ...(node.content?.length
            ? node.content.map((child) =>
                headingInline(
                  child,
                  Boolean(context.fontSize && node.type === "heading" && node.attrs?.level === 3),
                ),
              )
            : [{ text: "\u200b" }]),
        ],
        alignment: node.attrs?.textAlign ?? "left",
        ...(node.type === "heading"
          ? {
              fontSize: context.fontSize
                ? context.fontSize * [1.35, 1.15, 1][node.attrs!.level! - 1]!
                : [18, 14, 12][node.attrs!.level! - 1]!,
              bold: true,
              lineHeight: (node.attrs!.level === 3 ? 1.5 : 1.375) / context.lineMetric,
              headlineLevel: node.attrs!.level,
              ...(context.fontSize && node.attrs!.level === 3
                ? { characterSpacing: context.fontSize * 0.02 }
                : {}),
            }
          : {}),
        preserveLeadingSpaces: true,
        margin: [0, 0, 0, context.fontSize ? 0 : 8],
      };
    case "bulletList":
      return {
        ul: node.content!.map(render),
        margin: context.fontSize ? [18, 9, 0, 0] : [0, 0, 0, 8],
      };
    case "orderedList":
      return {
        ol: node.content!.map(render),
        start: node.attrs?.start ?? 1,
        margin: context.fontSize ? [18, 9, 0, 0] : [0, 0, 0, 8],
      };
    case "listItem":
      return { stack: node.content!.map(render) };
    case "blockquote":
      return {
        table: {
          widths: ["*"],
          body: [[{ stack: node.content!.map(render), border: [true, false, false, false] }]],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: (index) => (index === 0 ? 2.25 : 0),
          vLineColor: () => "#888888",
          paddingLeft: () => 12,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
        ...(context.fontSize ? { italics: true } : {}),
        margin: context.fontSize ? [0, 9, 0, 0] : [12, 4, 0, 10],
      };
    case "horizontalRule":
      return {
        table: { widths: ["*"], body: [[{ text: "", border: [false, true, false, false] }]] },
        layout: { hLineColor: () => "#888888" },
        margin: context.fontSize ? [0, 12, 0, 12] : [0, 6, 0, 10],
      };
    case "pageBreak":
      return { text: "", pageBreak: "before" };
    case "table":
      return tableContent(node, context);
    case "signatures": {
      const content = signatureContent(
        node,
        context.signatureIndex,
        context.signers,
        context.width,
        context.fontSize ?? 11,
        context.lineMetric,
      );
      context.signatureIndex += node.content!.length;
      return content;
    }
    default:
      throw new Error("Nodo de documento inválido para PDF.");
  }
}

export function richDocPdf(
  document: RichDoc,
  options: { signers?: PdfSigner[]; matchEditor?: boolean } = {},
): Content[] {
  const page = resolvePage(document.attrs?.page);
  const signers = [...(options.signers ?? [])].sort(
    (first, second) => first.signingOrder - second.signingOrder,
  );
  const source = withSignatureSlots(document, signers.length);
  const context: RenderContext = {
    fontSize: options.matchEditor ? page.fontSize : undefined,
    lineMetric: options.matchEditor ? FONT_LINE_METRICS[page.font] : 1,
    width: PAPER_SIZES[page.size].width - mmToPt(page.margins.left + page.margins.right),
    counters: [0, 0, 0],
    signatureIndex: 1,
    signers,
  };
  return source.content.map((node, index) => {
    const block = blockContent(node, context);
    if (options.matchEditor && typeof block === "object" && !Array.isArray(block)) {
      (block as ContentBase & { id?: string }).id = `block-${index}`;
      if (node.type === "paragraph") (block as ContentBase).margin = [0, index ? 9 : 0, 0, 0];
      if (node.type === "heading")
        (block as ContentBase).margin = [0, index ? [15, 12, 9][node.attrs!.level! - 1]! : 0, 0, 0];
    }
    return block;
  });
}
