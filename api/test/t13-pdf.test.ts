import { expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { parseRichDoc } from "../src/lib/rich-doc/schema.js";
import { richDocPdf } from "../src/lib/rich-doc/pdf.js";
import { makePdf } from "../src/lib/pdf.js";
import type { RichNode, MarkType } from "../src/lib/rich-doc/types.js";

function paragraph(text: string): RichNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function cell(text: string, type = "tableCell", attrs = {}): RichNode {
  return { type, attrs, content: [paragraph(text)] };
}

const marks: MarkType[] = [
  "bold",
  "italic",
  "underline",
  "strike",
  "superscript",
  "subscript",
  "highlight",
];

function syntheticDocument() {
  return parseRichDoc({
    type: "doc",
    content: [
      ...[1, 2, 3].map((level) => ({
        type: "heading",
        attrs: { level, textAlign: "center" },
        content: [{ type: "text", text: `Título de nivel ${level}` }],
      })),
      {
        type: "paragraph",
        content: marks.flatMap((mark) => [
          { type: "text", text: ` ${mark} `, marks: [{ type: mark }] },
          { type: "text", text: " | " },
        ]),
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "  Espacios iniciales y caracteres < > & {{literal}}" },
          { type: "hardBreak" },
          { type: "variable", attrs: { name: "pendiente" }, marks: [{ type: "italic" }] },
        ],
      },
      ...["left", "right", "justify"].map((textAlign) => ({
        type: "paragraph",
        attrs: { textAlign },
        content: [
          {
            type: "text",
            text:
              `Alineación ${textAlign}. ` +
              "Texto de ejemplo para revisar la composición del documento. ".repeat(4),
          },
        ],
      })),
      {
        type: "orderedList",
        attrs: { start: 7 },
        content: [
          {
            type: "listItem",
            content: [
              paragraph("Primero, numeración desde siete"),
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [
                      paragraph("Viñeta anidada"),
                      {
                        type: "orderedList",
                        attrs: { start: 3 },
                        content: [
                          {
                            type: "listItem",
                            content: [paragraph("Sublista numerada desde tres")],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          { type: "listItem", content: [paragraph("Segundo elemento, número ocho")] },
        ],
      },
      { type: "blockquote", content: [paragraph("Cita con sangría y borde izquierdo visible.")] },
      { type: "horizontalRule" },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              cell("Encabezado A", "tableHeader"),
              cell("Encabezado B", "tableHeader"),
              cell("Encabezado C", "tableHeader"),
            ],
          },
          {
            type: "tableRow",
            content: [
              cell("Dos columnas", "tableCell", { colspan: 2 }),
              cell("Dos filas", "tableCell", { rowspan: 2 }),
            ],
          },
          { type: "tableRow", content: [cell("Dato A"), cell("Dato B")] },
        ],
      },
      { type: "pageBreak" },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Página después del salto explícito" }],
      },
      {
        type: "table",
        attrs: { borderless: true },
        content: [
          {
            type: "tableRow",
            content: [
              cell("________________________\nFirma de la institución"),
              cell("________________________\nFirma del cliente"),
            ],
          },
        ],
      },
    ],
  });
}

it("mapea todos los nodos y marcas a pdfmake, respeta spans y genera un PDF autónomo", async () => {
  const content = richDocPdf(syntheticDocument());
  expect(content[0]).toMatchObject({ fontSize: 18, bold: true, alignment: "center" });
  expect(content[1]).toMatchObject({ fontSize: 14 });
  expect(content[2]).toMatchObject({ fontSize: 12 });
  expect(content[3]).toMatchObject({
    text: expect.arrayContaining([
      expect.objectContaining({ bold: true }),
      expect.objectContaining({ italics: true }),
      expect.objectContaining({ decoration: ["underline"] }),
      expect.objectContaining({ decoration: ["lineThrough"] }),
      expect.objectContaining({ sup: true }),
      expect.objectContaining({ sub: true }),
      expect.objectContaining({ background: "#fff59d" }),
    ]),
  });
  expect(content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ start: 7 }),
      expect.objectContaining({ pageBreak: "before" }),
      expect.objectContaining({
        layout: "noBorders",
        table: expect.objectContaining({ widths: ["*", "*"] }),
      }),
      expect.objectContaining({
        table: expect.objectContaining({
          widths: ["*", "*", "*"],
          headerRows: 1,
          body: expect.arrayContaining([
            [expect.objectContaining({ colSpan: 2 }), {}, expect.objectContaining({ rowSpan: 2 })],
            [
              expect.objectContaining({ stack: expect.any(Array) }),
              expect.objectContaining({ stack: expect.any(Array) }),
              {},
            ],
          ]),
        }),
      }),
    ]),
  );
  const bytes = await makePdf(content, "T13 — Documento sintético");
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  if (process.env.T13_PDF_REVIEW === "true") {
    await mkdir("tmp", { recursive: true });
    await writeFile("tmp/t13-synthetic.pdf", bytes);
  }
});

it("genera PDF con contenedores vacíos y filas totalmente cubiertas por rowspan", async () => {
  const document = parseRichDoc({
    type: "doc",
    content: [
      { type: "bulletList", content: [] },
      { type: "orderedList", content: [] },
      { type: "blockquote", content: [] },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [{ type: "tableCell", attrs: { rowspan: 2 }, content: [] }],
          },
          { type: "tableRow", content: [] },
        ],
      },
    ],
  });
  const bytes = await makePdf(richDocPdf(document), "Contenedores vacíos");
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
});
