import type { Content, ContentText, TableCell } from "pdfmake/interfaces.js";
import type { RichDoc, RichNode } from "./types.js";
import { tableGrid } from "./table.js";

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

function tableContent(node: RichNode): Content {
  const { positions, width } = tableGrid(node);
  const body: TableCell[][] = node.content!.map(() => Array.from({ length: width }, () => ({})));
  for (const { cell, row, column } of positions) {
    body[row]![column] = {
      stack: cell.content!.map(blockContent),
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
    table: { widths: Array<string>(width).fill("*"), body, headerRows },
    ...(node.attrs?.borderless ? { layout: "noBorders" } : {}),
    margin: [0, 4, 0, 10],
  };
}

function blockContent(node: RichNode): Content {
  switch (node.type) {
    case "paragraph":
    case "heading":
      return {
        text: node.content?.map(inlineContent) ?? "",
        alignment: node.attrs?.textAlign ?? "left",
        ...(node.type === "heading"
          ? { fontSize: [18, 14, 12][node.attrs!.level! - 1]!, bold: true }
          : {}),
        preserveLeadingSpaces: true,
        margin: [0, 0, 0, 8],
      };
    case "bulletList":
      return { ul: node.content!.map(blockContent), margin: [0, 0, 0, 8] };
    case "orderedList":
      return {
        ol: node.content!.map(blockContent),
        start: node.attrs?.start ?? 1,
        margin: [0, 0, 0, 8],
      };
    case "listItem":
      return { stack: node.content!.map(blockContent) };
    case "blockquote":
      return {
        table: {
          widths: ["*"],
          body: [[{ stack: node.content!.map(blockContent), border: [true, false, false, false] }]],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: (index) => (index === 0 ? 2 : 0),
          vLineColor: () => "#888888",
          paddingLeft: () => 10,
        },
        margin: [12, 4, 0, 10],
      };
    case "horizontalRule":
      return {
        table: { widths: ["*"], body: [[{ text: "", border: [false, true, false, false] }]] },
        layout: { hLineColor: () => "#888888" },
        margin: [0, 6, 0, 10],
      };
    case "pageBreak":
      return { text: "", pageBreak: "before" };
    case "table":
      return tableContent(node);
    default:
      throw new Error("Nodo de documento inválido para PDF.");
  }
}

export function richDocPdf(document: RichDoc): Content[] {
  return document.content.map(blockContent);
}
