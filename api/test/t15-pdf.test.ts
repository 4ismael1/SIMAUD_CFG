import { expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import type { Content, ContentBase, Node as PdfNode } from "pdfmake/interfaces.js";
import { documentPdf } from "../src/lib/rich-doc/document-pdf.js";
import { parseRichDoc } from "../src/lib/rich-doc/schema.js";
import { richDocPdf } from "../src/lib/rich-doc/pdf.js";
import { pageOptions } from "../src/lib/rich-doc/page.js";
import { paginateBlocks } from "../src/lib/rich-doc/pagination.js";
import { makePdf } from "../src/lib/pdf.js";
import { validPng } from "./image-fixtures.js";
import { encodeRgba } from "../src/lib/storage-png.js";
import type { RichNode, RichDoc } from "../src/lib/rich-doc/types.js";

const paragraph = (text: string): RichNode => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const heading = (text: string, level = 2): RichNode => ({
  type: "heading",
  attrs: { level, numbered: "ordinal" },
  content: [{ type: "text", text }],
});
const signatures = (columns: 1 | 2 | 3, count: number = columns): RichNode => ({
  type: "signatures",
  attrs: { columns },
  content: Array.from({ length: count }, (_, index) => ({
    type: "signatureSlot",
    attrs: { label: ["EL CLIENTE", "EL CONTRATISTA", "TESTIGO"][index % 3]! },
  })),
});

function signaturePng(): Buffer {
  const width = 240;
  const height = 60;
  const pixels = Buffer.alloc(width * height * 4);
  for (let x = 8; x < width - 8; x++) {
    const y = Math.round(30 + Math.sin(x / 7) * 13 * (1 - x / width));
    for (let offset = -1; offset <= 1; offset++) {
      const pixel = ((y + offset) * width + x) * 4;
      pixels[pixel] = 24;
      pixels[pixel + 1] = 38;
      pixels[pixel + 2] = 70;
      pixels[pixel + 3] = 255;
    }
  }
  return encodeRgba(width, height, pixels);
}

async function layout(document: RichDoc) {
  const options = pageOptions(document.attrs?.page);
  const blocks = richDocPdf(document, { matchEditor: true });
  const paginated = await paginateBlocks(document, blocks, options);
  const nodes = new Map<string, PdfNode>();
  await makePdf(paginated.content, "Reglas de paginación", {
    ...options,
    pageBreakBefore: (node, queries) => {
      for (const observed of [
        node,
        ...queries.getPreviousNodesOnPage(),
        ...queries.getFollowingNodesOnPage(),
        ...queries.getNodesOnNextPage(),
      ])
        if (observed.id) nodes.set(observed.id, observed);
      return paginated.pageBreakBefore!(node, queries);
    },
  });
  return { blocks, nodes };
}

it("mueve entero un párrafo que cabe en una hoja y permite continuar uno más alto", async () => {
  const document = parseRichDoc({
    type: "doc",
    content: [
      paragraph("Inicio. ".repeat(900)),
      paragraph("Bloque completo. ".repeat(45)),
      paragraph("Continuación. ".repeat(1200)),
    ],
  });
  const { blocks, nodes } = await layout(document);
  expect((blocks[0] as ContentBase).unbreakable).toBe(false);
  expect((blocks[1] as ContentBase).unbreakable).toBe(true);
  expect(nodes.get("block-1")!.pageNumbers).toHaveLength(1);
  expect(nodes.get("block-2")!.pageNumbers.length).toBeGreaterThan(1);
});

it("mantiene el título con el inicio siguiente, el cierre con las firmas y aplica el salto explícito", async () => {
  const document = parseRichDoc({
    type: "doc",
    content: [
      paragraph("Texto. ".repeat(450)),
      heading("Cláusula unida"),
      paragraph("Cláusula. ".repeat(30)),
      paragraph("En constancia de lo anterior."),
      signatures(2),
      { type: "pageBreak" },
      paragraph("Después del salto"),
    ],
  });
  const { nodes, blocks } = await layout(document);
  expect(nodes.get("block-1")!.pageNumbers[0]).toBe(nodes.get("block-2")!.pageNumbers[0]);
  expect(nodes.get("block-3")!.pageNumbers[0]).toBe(nodes.get("block-4")!.pageNumbers[0]);
  expect((blocks[6] as ContentBase).pageBreak).toBe("before");
});

it("mapea cláusulas por nivel y banderas showName/showId", () => {
  const document = parseRichDoc({
    type: "doc",
    content: [
      heading("Uno"),
      heading("Nivel uno", 1),
      heading("Dos"),
      {
        type: "signatures",
        content: [
          {
            type: "signatureSlot",
            attrs: { label: "SOLO ETIQUETA", showName: false, showId: false },
          },
        ],
      },
    ],
  });
  const text = JSON.stringify(richDocPdf(document, { matchEditor: true }));
  expect(text).toContain("SEGUNDA. ");
  expect(text).toContain("SOLO ETIQUETA");
  expect(text).not.toContain("[Firmante");
  expect(text).not.toContain("C.I.");
});

it("rechaza firmas más altas que una hoja sin perder casillas", async () => {
  await expect(
    documentPdf(parseRichDoc({ type: "doc", content: [signatures(1, 12)] }), "Demasiadas firmas"),
  ).rejects.toThrow("supera una página");
});

it("avisa cuando una banda no cabe en el margen para evitar recortar su contenido", async () => {
  const document = parseRichDoc({
    type: "doc",
    attrs: {
      page: { margins: { top: 10, right: 25, bottom: 25, left: 25 } },
      header: { left: { kind: "logo", height: 40 } },
    },
    content: [paragraph("Texto")],
  });
  await expect(
    documentPdf(document, "Banda grande", {
      logo: "data:image/png;base64," + validPng().toString("base64"),
    }),
  ).rejects.toThrow("supera su margen");
});

function synthetic(size: "letter" | "a4", font: "serif" | "sans"): RichDoc {
  const cell = (text: string, type: string): RichNode => ({ type, content: [paragraph(text)] });
  return parseRichDoc({
    type: "doc",
    attrs: {
      page: { size, font },
      header: {
        left: { kind: "logo", height: 10 },
        center: { kind: "text", text: "INSTITUCIÓN DE PRUEBA" },
        right: { kind: "text", text: "SIMAUD · T15", size: 8 },
        skipFirstPage: true,
      },
      footer: { center: { kind: "pageNumber" } },
    },
    content: [
      heading("Contrato de servicios", 1),
      paragraph(
        "Documento sintético para revisar Carta/A4, tildes y números. Ñandú, cláusula, RD$ 125.00.",
      ),
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Regular · " },
          { type: "text", text: "Itálica · ", marks: [{ type: "italic" }] },
          { type: "text", text: "Negrita · ", marks: [{ type: "bold" }] },
          { type: "text", text: "Negrita itálica", marks: [{ type: "bold" }, { type: "italic" }] },
        ],
      },
      ...["Objeto", "Obligaciones"].flatMap((title) => [
        heading(title),
        paragraph("Las partes acuerdan las condiciones aquí descritas. ".repeat(5)),
      ]),
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [cell("Concepto", "tableHeader"), cell("Condición", "tableHeader")],
          },
          ...Array.from({ length: 22 }, (_, index) => ({
            type: "tableRow",
            content: [
              cell(`Servicio ${index + 1}`, "tableCell"),
              cell("Condiciones verificables del acuerdo y cumplimiento.", "tableCell"),
            ],
          })),
        ],
      },
      { type: "pageBreak" },
      heading("Aceptación"),
      paragraph("En constancia de lo anterior, las partes firman en las casillas siguientes."),
      signatures(1),
      signatures(2),
      signatures(3),
    ],
  });
}

it.each([
  ["letter", "serif"],
  ["a4", "sans"],
] as const)(
  "genera PDF autónomo %s/%s con bandas, tabla continuada y firmas en 1/2/3 columnas",
  async (size, font) => {
    const bytes = await documentPdf(synthetic(size, font), "Revisión T15", {
      logo: "data:image/png;base64," + validPng().toString("base64"),
      signers: Array.from({ length: 6 }, (_, index) => ({
        signingOrder: index + 1,
        name: `Firmante de prueba ${index + 1}`,
        cedula: "00100000000",
        signedAt: new Date("2026-11-10T14:30:00Z"),
        image: "data:image/png;base64," + signaturePng().toString("base64"),
      })),
    });
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.T15_PDF_REVIEW === "true") {
      await mkdir("tmp", { recursive: true });
      await writeFile(`tmp/t15-${size}-${font}.pdf`, bytes);
    }
  },
);

it("pinta bandas con las posiciones elegidas, paginación y primera página distinta", () => {
  const options = pageOptions(
    undefined,
    { left: { kind: "text", text: "Izquierda", size: 12 }, skipFirstPage: true },
    { right: { kind: "pageNumber" } },
  );
  const header = options.header as (page: number, pages: number) => Content;
  const footer = options.footer as (page: number, pages: number) => Content;
  expect(header(1, 3)).toEqual({ text: "" });
  expect(JSON.stringify(header(2, 3))).toContain("Izquierda");
  expect(JSON.stringify(footer(2, 3))).toContain("Página 2 de 3");
});
