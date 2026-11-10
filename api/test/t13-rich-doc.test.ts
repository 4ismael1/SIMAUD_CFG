import { expect, it } from "vitest";
import { canonicalRichDoc, parseRichDoc } from "../src/lib/rich-doc/schema.js";
import { extractVariables, renderRichDoc, richDocText } from "../src/lib/rich-doc/render.js";
import { contentDocumentHash, encodeContent } from "../src/lib/rich-doc/content.js";
import { renderTemplate } from "../src/lib/render-template.js";

const paragraph = (content: unknown[] = []) => ({ type: "paragraph", content });
const document = (content: unknown[]) => ({ type: "doc", content });
const text = (value = "Texto") => ({ type: "text", text: value });
const variable = (name = "cliente") => ({ type: "variable", attrs: { name } });
const cell = (attrs = {}) => ({ type: "tableCell", attrs, content: [paragraph()] });
const table = (rows: unknown[][]) =>
  document([{ type: "table", content: rows.map((content) => ({ type: "tableRow", content })) }]);

it("ordena las claves y omite atributos nulos y predeterminados sin alterar texto ni marcas", () => {
  const input = {
    content: [
      {
        content: [{ marks: [{ type: "bold" }], text: "  & <html>\r\n", type: "text" }],
        attrs: { textAlign: "left" },
        type: "paragraph",
      },
    ],
    type: "doc",
  };
  expect(canonicalRichDoc(input)).toBe(
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"  & <html>\\r\\n","marks":[{"type":"bold"}]}]}]}',
  );
  expect(canonicalRichDoc(document([paragraph()]))).toBe(
    canonicalRichDoc(document([{ type: "paragraph", attrs: null }])),
  );
  expect(canonicalRichDoc(table([[cell({ colspan: 1, rowspan: 1, colwidth: null })]]))).toBe(
    canonicalRichDoc(table([[cell()]])),
  );
  expect(
    canonicalRichDoc(
      document([
        {
          type: "orderedList",
          attrs: { start: null },
          content: [{ type: "listItem", content: [paragraph()] }],
        },
      ]),
    ),
  ).not.toContain("attrs");
  expect(
    canonicalRichDoc(
      document([
        {
          type: "table",
          attrs: { borderless: false },
          content: [{ type: "tableRow", content: [cell()] }],
        },
      ]),
    ),
  ).not.toContain("borderless");
});

it.each(["href", "style", "class", "onclick", "html", "src"])(
  "rechaza el atributo desconocido %s y conserva la ruta del nodo",
  (attribute) => {
    expect(() =>
      parseRichDoc(document([{ type: "paragraph", attrs: { [attribute]: "<script>" } }])),
    ).toThrow(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        details: expect.arrayContaining([
          expect.objectContaining({ field: expect.stringContaining("content.0") }),
        ]),
      }),
    );
  },
);

it.each([
  { type: "script", content: [] },
  { type: "image", attrs: { src: "https://example.com" } },
  {
    type: "paragraph",
    content: [
      { type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:x" } }] },
    ],
  },
  {
    type: "paragraph",
    content: [{ type: "text", text: "x", marks: [{ type: "bold" }, { type: "bold" }] }],
  },
  { type: "paragraph", content: [{ type: "text", text: "" }] },
  { type: "paragraph", content: [{ type: "text", text: "x".repeat(20001) }] },
  { type: "paragraph", content: [{ type: "hardBreak", attrs: {} }] },
  { type: "paragraph", attrs: { textAlign: "start" } },
  { type: "heading", attrs: { level: 0 } },
  { type: "heading", attrs: { level: 4 } },
  { type: "heading", attrs: { level: 1.5 } },
  { type: "heading", attrs: {} },
  { type: "orderedList", attrs: { start: 0 }, content: [] },
  { type: "orderedList", attrs: { start: 10000 }, content: [] },
  { type: "bulletList", content: [{ type: "listItem", content: [] }] },
  { type: "bulletList", content: [{ type: "paragraph" }] },
  {
    type: "bulletList",
    content: [{ type: "listItem", content: [{ type: "bulletList", content: [] }] }],
  },
  { type: "blockquote", content: [{ type: "pageBreak" }] },
  { type: "horizontalRule", content: [] },
  { type: "pageBreak", attrs: {} },
])("rechaza una estructura fuera de rich-v1 %#", (node) => {
  expect(() => parseRichDoc(document([node]))).toThrow(
    expect.objectContaining({ statusCode: 400 }),
  );
});

it.each(["a", "_cliente", "Cliente", "a-b", "área", "x".repeat(51)])(
  "rechaza el nombre de variable %s",
  (name) => {
    expect(() => parseRichDoc(document([paragraph([variable(name)])]))).toThrow();
  },
);

it.each(
  [
    [],
    [[cell({ colspan: 13 })]],
    [[cell({ colspan: 0 })]],
    [[cell({ rowspan: 0 })]],
    [[cell({ rowspan: 201 })]],
    [[cell({ rowspan: 2 })]],
    [[cell({ colwidth: [19] })]],
    [[cell({ colwidth: [2001] })]],
    [[cell({ colwidth: [20.5] })]],
    [[cell({ colspan: 2, colwidth: [100] })]],
    [[cell(), cell()], [cell()]],
    [
      [cell(), cell({ rowspan: 2 }), cell()],
      [cell({ colspan: 2 }), cell()],
    ],
    [Array.from({ length: 13 }, () => cell())],
    Array.from({ length: 201 }, () => [cell()]),
  ].map((rows) => ({ rows })),
)("rechaza tablas con dimensiones o combinaciones incoherentes %#", ({ rows }) => {
  expect(() => parseRichDoc(table(rows))).toThrow();
});

it("acepta celdas combinadas, una fila cubierta por rowspan y límites de tabla", () => {
  expect(() =>
    parseRichDoc(
      table([[cell({ colspan: 2, rowspan: 2, colwidth: [20, 2000] }), cell()], [cell()]]),
    ),
  ).not.toThrow();
  expect(() => parseRichDoc(table([[cell({ rowspan: 2 })], []]))).not.toThrow();
  const coveredRow = table([[cell({ rowspan: 2 })], []]);
  const canonical = canonicalRichDoc(coveredRow);
  expect(canonicalRichDoc(JSON.parse(canonical) as unknown)).toBe(canonical);
  expect(() => parseRichDoc(table(Array.from({ length: 200 }, () => [cell()])))).not.toThrow();
  expect(() =>
    parseRichDoc(
      table(Array.from({ length: 200 }, () => Array.from({ length: 12 }, () => cell()))),
    ),
  ).not.toThrow();
  expect(() => parseRichDoc(table([Array.from({ length: 12 }, () => cell())]))).not.toThrow();
});

it("conserva arrays obligatorios vacíos al canonicalizar contenedores", () => {
  const input = document([
    { type: "bulletList", content: [] },
    { type: "orderedList", content: [] },
    { type: "blockquote", content: [] },
    {
      type: "table",
      content: [{ type: "tableRow", content: [{ type: "tableCell", content: [] }] }],
    },
  ]);
  const canonical = canonicalRichDoc(input);
  expect(canonicalRichDoc(JSON.parse(canonical) as unknown)).toBe(canonical);
});

it("limita bytes UTF-8, profundidad, bloques y variables antes de recorrer recursivamente", () => {
  expect(() => parseRichDoc(document([]))).toThrow();
  expect(() =>
    parseRichDoc(document(Array.from({ length: 2000 }, () => paragraph()))),
  ).not.toThrow();
  expect(() => parseRichDoc(document(Array.from({ length: 2001 }, () => paragraph())))).toThrow();
  expect(() =>
    parseRichDoc(document([paragraph(Array.from({ length: 5000 }, () => variable()))])),
  ).not.toThrow();
  expect(() =>
    parseRichDoc(document([paragraph(Array.from({ length: 5001 }, () => variable()))])),
  ).toThrow();
  const belowByteLimit = document(
    Array.from({ length: 10 }, () => paragraph([text("é".repeat(20000))])),
  );
  const aboveByteLimit = document(
    Array.from({ length: 14 }, () => paragraph([text("é".repeat(20000))])),
  );
  expect(() => parseRichDoc(belowByteLimit)).not.toThrow();
  expect(() => parseRichDoc(aboveByteLimit)).toThrow();
  let nested: unknown = paragraph();
  for (let index = 0; index < 5; index++)
    nested = {
      type: "bulletList",
      content: [{ type: "listItem", content: [paragraph(), nested] }],
    };
  expect(() => parseRichDoc(document([nested]))).not.toThrow();
  nested = { type: "bulletList", content: [{ type: "listItem", content: [paragraph(), nested] }] };
  expect(() => parseRichDoc(document([nested]))).toThrow();
});

it("extrae variables por nodos, conserva marcas y comparte las reglas de texto plano", () => {
  const defs = [
    { name: "cliente", type: "text" },
    { name: "fecha", type: "date" },
    { name: "importe", type: "money" },
    { name: "numero", type: "number" },
    { name: "opcion", type: "select", options: ["Mensual"] },
  ];
  const values = {
    cliente: "<Ana & José>",
    fecha: "2026-11-10",
    importe: "1234.50",
    numero: 1200,
    opcion: "Mensual",
  };
  const nodes = defs.map(({ name }) => ({ ...variable(name), marks: [{ type: "italic" }] }));
  const input = parseRichDoc(
    document([
      paragraph([
        text("{{literal}}"),
        ...nodes,
        variable("cliente"),
        variable("ausente"),
        variable("ausente"),
      ]),
    ]),
  );
  const before = canonicalRichDoc(input);
  expect(extractVariables(input)).toEqual([...defs.map((def) => def.name), "ausente"]);
  const result = renderRichDoc(input, values, defs);
  expect(result.missing).toEqual(["ausente"]);
  expect(result.document.content[0]!.content![1]).toEqual({
    type: "text",
    text: "<Ana & José>",
    marks: [{ type: "italic" }],
  });
  for (const [index, def] of defs.entries()) {
    const plain = renderTemplate("{{" + def.name + "}}", values, defs).html;
    const resolved = result.document.content[0]!.content![index + 1]!.text!;
    if (def.type !== "text") expect(resolved).toBe(plain);
  }
  expect(richDocText(result.document)).toContain("{{literal}}<Ana & José>");
  expect(canonicalRichDoc(input)).toBe(before);
  expect(() => renderRichDoc(input, { ...values, opcion: "Otra" }, defs)).toThrow();
  expect(() => renderRichDoc(input, { ...values, fecha: "2026-02-30" }, defs)).toThrow();
  expect(() => renderRichDoc(input, { ...values, numero: "NaN" }, defs)).toThrow();
});

it("hashea la serialización canónica rich-v1 y conserva exactamente el hash plain", () => {
  const first = document([
    { type: "heading", attrs: { level: 1, textAlign: "center" }, content: [text()] },
  ]);
  const reordered = {
    content: [
      {
        content: [{ text: "Texto", type: "text" }],
        attrs: { textAlign: "center", level: 1 },
        type: "heading",
      },
    ],
    type: "doc",
  };
  const hash = (value: unknown) => contentDocumentHash(JSON.stringify(value), "rich-v1");
  expect(hash(first)).toBe(hash(reordered));
  const changedMark = parseRichDoc(first);
  changedMark.content[0]!.content![0]!.marks = [{ type: "bold" }];
  expect(hash(first)).not.toBe(hash(changedMark));
  const changedAlignment = parseRichDoc(first);
  changedAlignment.content[0]!.attrs!.textAlign = "right";
  expect(hash(first)).not.toBe(hash(changedAlignment));
  expect(contentDocumentHash("Hola &amp; tú  \r\nMundo\t\r")).toBe(
    contentDocumentHash("Hola & tú\nMundo\n", "plain"),
  );
  expect(() => encodeContent(first, "plain")).toThrow();
  expect(() => encodeContent("Texto", "rich-v1")).toThrow();
});
