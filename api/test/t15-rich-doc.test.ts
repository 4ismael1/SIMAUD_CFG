import { expect, it } from "vitest";
import { canonicalRichDoc, parseRichDoc } from "../src/lib/rich-doc/schema.js";
import {
  contentDocumentHash,
  contentResponse,
  encodeContent,
  renderContent,
} from "../src/lib/rich-doc/content.js";
import { clauseNumber } from "../src/lib/rich-doc/numbering.js";
import { pageOptions, DEFAULT_PAGE } from "../src/lib/rich-doc/page.js";
import { withSignatureSlots } from "../src/lib/rich-doc/signatures.js";
import type { RichDoc } from "../src/lib/rich-doc/types.js";

const document: RichDoc = { type: "doc", content: [{ type: "paragraph" }] };

it("exige declarar rich-v2 cuando hay funciones nuevas y acepta v1 con sus valores por defecto", () => {
  expect(encodeContent(document, "rich-v1")).toBe(canonicalRichDoc(document));
  const premium = { ...document, attrs: { page: { size: "legal" } } };
  expect(() => encodeContent(premium, "rich-v1")).toThrow("rich-v2");
  expect(encodeContent(premium, "rich-v2")).toBe(canonicalRichDoc(premium));
});

it("canonicaliza los valores por defecto de v2 y conserva el hash histórico de v1", () => {
  const explicit = { ...document, attrs: { page: DEFAULT_PAGE, header: {} } };
  expect(canonicalRichDoc(explicit)).toBe(canonicalRichDoc(document));
  expect(contentDocumentHash(canonicalRichDoc(document), "rich-v1")).toBe(
    contentDocumentHash(canonicalRichDoc(explicit), "rich-v2"),
  );
  const changed = {
    ...document,
    attrs: { page: { margins: { top: 26, right: 25, bottom: 25, left: 25 } } },
  };
  expect(contentDocumentHash(canonicalRichDoc(changed), "rich-v2")).not.toBe(
    contentDocumentHash(canonicalRichDoc(document), "rich-v2"),
  );
});

it("ordena los atributos de página, bandas y casillas de manera estable", () => {
  const input = {
    ...document,
    attrs: {
      footer: { right: { format: "pageOfTotal", kind: "pageNumber" }, skipFirstPage: false },
      page: { font: "sans", size: "a4" },
    },
    content: [
      {
        type: "signatures",
        attrs: { columns: 2 },
        content: [
          { type: "signatureSlot", attrs: { showId: true, showName: false, label: "CLIENTE" } },
        ],
      },
    ],
  };
  const encoded = canonicalRichDoc(input);
  expect(encoded).toContain(
    '"attrs":{"page":{"size":"a4","font":"sans"},"footer":{"right":{"kind":"pageNumber"}}}',
  );
  expect(encoded).toContain('"attrs":{"label":"CLIENTE","showName":false}');
  expect(canonicalRichDoc(JSON.parse(encoded))).toBe(encoded);
});

it.each([
  { page: { size: "a3" } },
  { page: { size: null } },
  { page: { fontSize: 9 } },
  { page: { lineHeight: 1.2 } },
  { page: { font: "Arial" } },
  { page: { margins: { top: 9, right: 25, bottom: 25, left: 25 } } },
  { page: { margins: { top: 25.5, right: 25, bottom: 25, left: 25 } } },
  { page: { margins: { top: 25 } } },
  { header: { left: { kind: "text", text: "" } } },
  { footer: { right: { kind: "logo", height: 41 } } },
  { header: { left: { kind: "logo", src: "https://example.com" } } },
  { footer: { left: { kind: "pageNumber", format: "html" } } },
  { footer: { left: { kind: "text", text: "x", size: 15 } } },
  { header: { center: { kind: "text", text: "x".repeat(121) } } },
  { unknown: true },
])("rechaza atributos de documento ajenos o fuera de rango: %j", (attrs) => {
  expect(() => parseRichDoc({ ...document, attrs })).toThrow();
});

it.each([
  {
    type: "signatures",
    attrs: { columns: 4 },
    content: [{ type: "signatureSlot", attrs: { label: "" } }],
  },
  { type: "signatures", content: [] },
  {
    type: "signatures",
    content: Array.from({ length: 13 }, () => ({ type: "signatureSlot", attrs: { label: "" } })),
  },
  { type: "signatures", content: [{ type: "signatureSlot", attrs: { label: "x".repeat(61) } }] },
  {
    type: "signatures",
    content: [{ type: "signatureSlot", attrs: { label: "", showName: "false" } }],
  },
  { type: "signatureSlot", attrs: { label: "" } },
  { type: "heading", attrs: { level: 2, numbered: "roman" } },
])("rechaza casillas, columnas y numeración no válidas: %j", (node) => {
  expect(() => parseRichDoc({ type: "doc", content: [node] })).toThrow();
});

it("transporta rich-v2 y resuelve variables conservando maqueta y marcas", () => {
  const input = {
    ...document,
    attrs: { page: { size: "legal" } },
    content: [
      {
        type: "paragraph",
        content: [{ type: "variable", attrs: { name: "cliente" }, marks: [{ type: "bold" }] }],
      },
    ],
  };
  const content = encodeContent(input, "rich-v2");
  expect(contentResponse({ content, contentFormat: "rich-v2" })).toEqual({
    content: input,
    contentFormat: "rich-v2",
  });
  expect(renderContent(content, "rich-v2", { cliente: "Ana" }, [])).toMatchObject({
    contentFormat: "rich-v2",
    document: {
      attrs: input.attrs,
      content: [{ content: [{ type: "text", text: "Ana", marks: [{ type: "bold" }] }] }],
    },
  });
});

it("añade casillas al último bloque y respeta las sobrantes sin mutar el original", () => {
  const original = parseRichDoc({
    type: "doc",
    content: [
      { type: "signatures", content: [{ type: "signatureSlot", attrs: { label: "CLIENTE" } }] },
      { type: "paragraph" },
      {
        type: "signatures",
        attrs: { columns: 3 },
        content: [{ type: "signatureSlot", attrs: { label: "TESTIGO" } }],
      },
    ],
  });
  const result = withSignatureSlots(original, 5);
  expect(result.content[0]!.content).toHaveLength(1);
  expect(result.content[2]!.content).toHaveLength(4);
  expect(original.content[2]!.content).toHaveLength(1);
  expect(withSignatureSlots(original, 1)).toEqual(original);
  expect(withSignatureSlots(document, 3).content[1]).toMatchObject({
    type: "signatures",
    content: expect.any(Array),
  });
});

it("numera cláusulas en español hasta cincuenta y usa decimal después", () => {
  expect(
    [1, 10, 11, 12, 19, 21, 39, 50, 51].map((number) => clauseNumber(number, "ordinal")),
  ).toEqual([
    "PRIMERA.",
    "DÉCIMA.",
    "UNDÉCIMA.",
    "DUODÉCIMA.",
    "DECIMONOVENA.",
    "VIGÉSIMA PRIMERA.",
    "TRIGÉSIMA NOVENA.",
    "QUINCUAGÉSIMA.",
    "51.",
  ]);
});

it.each(["letter", "legal", "a4"] as const)(
  "usa papel %s, milímetros, fuentes y espaciado compartidos con el editor",
  (size) => {
    const options = pageOptions({ size, font: "sans", fontSize: 12, lineHeight: 2 });
    expect(options.defaultStyle).toEqual({ font: "Geist", fontSize: 12, lineHeight: 2 / 1.3 });
    expect(options.pageMargins).toEqual(Array<number>(4).fill((25 * 72) / 25.4));
    expect(options.header).toBeUndefined();
    expect(options.footer).toBeUndefined();
  },
);
