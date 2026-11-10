import { DEFAULT_PAGE, FONT_SIZES, LINE_HEIGHTS, compactPage } from "./page";
import type {
  BandSlot,
  DocAttrs,
  PageBand,
  PageSettings,
  SignatureSlotNode,
  BlockNode,
  BulletListNode,
  OrderedListNode,
  ParagraphNode,
  InlineNode,
  ListItemNode,
  MarkType,
  RichDoc,
  RichMark,
  TableCellNode,
  TableRowNode,
  TextAlign,
} from "./types";

/**
 * Rebuild a document from the editor's JSON keeping only what docs/RICH_DOC_FORMAT.md allows,
 * with default or null attributes removed. The API validates again; this keeps requests clean
 * (TipTap adds attributes such as `orderedList.type` that the API would reject).
 */

/** Blocks allowed inside list items and table cells. */
type NestedBlock = ParagraphNode | BulletListNode | OrderedListNode;

type Loose = {
  type?: unknown;
  text?: unknown;
  attrs?: Record<string, unknown> | null;
  marks?: unknown;
  content?: unknown;
};

const MARKS: readonly MarkType[] = [
  "bold",
  "italic",
  "underline",
  "strike",
  "superscript",
  "subscript",
  "highlight",
];
const ALIGNS: readonly TextAlign[] = ["left", "center", "right", "justify"];
const VARIABLE_NAME = /^[a-z][a-z0-9_]{1,49}$/;

function children(node: Loose): Loose[] {
  return Array.isArray(node.content) ? (node.content as Loose[]) : [];
}

function marksOf(node: Loose): { marks?: RichMark[] } {
  if (!Array.isArray(node.marks)) return {};
  const seen = new Set<MarkType>();
  for (const mark of node.marks as Loose[]) {
    if (MARKS.includes(mark.type as MarkType)) seen.add(mark.type as MarkType);
  }
  // Fixed order (the list above), so the same formatting always serializes the same way.
  const ordered = MARKS.filter((type) => seen.has(type));
  return ordered.length > 0 ? { marks: ordered.map((type) => ({ type })) } : {};
}

function alignOf(node: Loose): TextAlign | undefined {
  const value = node.attrs?.textAlign;
  return ALIGNS.includes(value as TextAlign) && value !== "left"
    ? (value as TextAlign)
    : undefined;
}

function inline(nodes: Loose[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const node of nodes) {
    if (
      node.type === "text" &&
      typeof node.text === "string" &&
      node.text.length > 0
    ) {
      out.push({ type: "text", text: node.text, ...marksOf(node) });
    } else if (node.type === "hardBreak") {
      out.push({ type: "hardBreak" });
    } else if (
      node.type === "variable" &&
      typeof node.attrs?.name === "string" &&
      VARIABLE_NAME.test(node.attrs.name)
    ) {
      out.push({
        type: "variable",
        attrs: { name: node.attrs.name },
        ...marksOf(node),
      });
    }
  }
  return out;
}

function withContent<T extends object>(
  base: T,
  content: InlineNode[],
): T & { content?: InlineNode[] } {
  return content.length > 0 ? { ...base, content } : base;
}

function paragraph(node: Loose) {
  const align = alignOf(node);
  return withContent(
    {
      type: "paragraph" as const,
      ...(align ? { attrs: { textAlign: align } } : {}),
    },
    inline(children(node)),
  );
}

function listItems(node: Loose): ListItemNode[] {
  return children(node)
    .filter((item) => item.type === "listItem")
    .map((item) => {
      const content = children(item).flatMap((child): NestedBlock[] => {
        if (child.type === "paragraph") return [paragraph(child)];
        if (child.type === "bulletList" || child.type === "orderedList")
          return block(child) as NestedBlock[];
        return [];
      });
      return {
        type: "listItem" as const,
        content:
          content[0]?.type === "paragraph"
            ? content
            : [{ type: "paragraph" as const }, ...content],
      };
    });
}

function positiveInt(value: unknown, max: number): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 1 &&
    value <= max
    ? value
    : undefined;
}

function tableCell(node: Loose): TableCellNode {
  const colspan = positiveInt(node.attrs?.colspan, 12);
  const rowspan = positiveInt(node.attrs?.rowspan, 200);
  const colwidth = Array.isArray(node.attrs?.colwidth)
    ? (node.attrs.colwidth as unknown[])
        .filter(
          (width): width is number =>
            typeof width === "number" && width >= 20 && width <= 2000,
        )
        .map(Math.round)
    : [];
  const attrs = {
    ...(colspan ? { colspan } : {}),
    ...(rowspan ? { rowspan } : {}),
    ...(colwidth.length > 0 ? { colwidth } : {}),
  };
  const content = children(node).flatMap((child): NestedBlock[] => {
    if (child.type === "paragraph") return [paragraph(child)];
    if (child.type === "bulletList" || child.type === "orderedList")
      return block(child) as NestedBlock[];
    return [];
  });
  return {
    type: node.type === "tableHeader" ? "tableHeader" : "tableCell",
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

function block(node: Loose): BlockNode[] {
  switch (node.type) {
    case "paragraph":
      return [paragraph(node)];
    case "heading": {
      const level =
        node.attrs?.level === 1 ||
        node.attrs?.level === 2 ||
        node.attrs?.level === 3
          ? node.attrs.level
          : 2;
      const align = alignOf(node);
      const numbered =
        node.attrs?.numbered === "ordinal" || node.attrs?.numbered === "decimal"
          ? node.attrs.numbered
          : undefined;
      return [
        withContent(
          {
            type: "heading" as const,
            attrs: {
              level,
              ...(align ? { textAlign: align } : {}),
              ...(numbered ? { numbered } : {}),
            },
          },
          inline(children(node)),
        ),
      ];
    }
    case "bulletList": {
      const items = listItems(node);
      return items.length > 0 ? [{ type: "bulletList", content: items }] : [];
    }
    case "orderedList": {
      const items = listItems(node);
      const start = positiveInt(node.attrs?.start, 9999);
      return items.length > 0
        ? [
            {
              type: "orderedList",
              ...(start ? { attrs: { start } } : {}),
              content: items,
            },
          ]
        : [];
    }
    case "blockquote": {
      const content = children(node).flatMap((child) =>
        ["paragraph", "heading", "bulletList", "orderedList"].includes(
          String(child.type),
        )
          ? block(child)
          : [],
      ) as Exclude<
        BlockNode,
        {
          type:
            | "blockquote"
            | "horizontalRule"
            | "pageBreak"
            | "table"
            | "signatures";
        }
      >[];
      return content.length > 0 ? [{ type: "blockquote", content }] : [];
    }
    case "signatures":
      return signatures(node);
    case "horizontalRule":
      return [{ type: "horizontalRule" }];
    case "pageBreak":
      return [{ type: "pageBreak" }];
    case "table": {
      const rows: TableRowNode[] = children(node)
        .filter((row) => row.type === "tableRow")
        .map((row): TableRowNode => ({
          type: "tableRow",
          content: children(row)
            .filter(
              (cell) =>
                cell.type === "tableCell" || cell.type === "tableHeader",
            )
            .map(tableCell),
        }))
        .filter((row) => row.content.length > 0);
      const borderless = node.attrs?.borderless === true;
      return rows.length > 0
        ? [
            {
              type: "table",
              ...(borderless ? { attrs: { borderless: true } } : {}),
              content: rows,
            },
          ]
        : [];
    }
    default:
      return [];
  }
}

/**
 * Signature boxes. The editor keeps them as one atom with `attrs.slots`; the stored format has one
 * `signatureSlot` child per box. Both shapes are accepted here and the stored one is produced.
 */
function signatures(node: Loose): BlockNode[] {
  const rawSlots = Array.isArray(node.attrs?.slots)
    ? (node.attrs.slots as Record<string, unknown>[])
    : children(node)
        .filter((child) => child.type === "signatureSlot")
        .map((child) => child.attrs ?? {});
  const slots: SignatureSlotNode[] = rawSlots.slice(0, 12).map((slot) => ({
    type: "signatureSlot",
    attrs: {
      label: typeof slot.label === "string" ? slot.label.slice(0, 60) : "",
      // T19: data prefix of the person in this box (cliente → cliente_nombre…); same rule as the API.
      ...(typeof slot.party === "string" && /^[a-z][a-z0-9]{0,29}$/.test(slot.party) ? { party: slot.party } : {}),
      ...(slot.showName === false ? { showName: false } : {}),
      ...(slot.showId === false ? { showId: false } : {}),
    },
  }));
  if (slots.length === 0) return [];
  const columns =
    node.attrs?.columns === 1 || node.attrs?.columns === 3
      ? node.attrs.columns
      : undefined;
  return [
    {
      type: "signatures",
      ...(columns ? { attrs: { columns } } : {}),
      content: slots,
    },
  ];
}

function bandSlot(value: unknown): BandSlot | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const slot = value as Record<string, unknown>;
  const between = (n: unknown, min: number, max: number) =>
    typeof n === "number" && n >= min && n <= max ? n : undefined;
  if (
    slot.kind === "text" &&
    typeof slot.text === "string" &&
    slot.text.trim()
  ) {
    const size = between(slot.size, 7, 14);
    return {
      kind: "text",
      text: slot.text.slice(0, 120),
      ...(size ? { size } : {}),
    };
  }
  if (slot.kind === "logo") {
    const height = between(slot.height, 8, 40);
    return { kind: "logo", ...(height ? { height } : {}) };
  }
  if (slot.kind === "pageNumber")
    return {
      kind: "pageNumber",
      ...(slot.format === "page" ? { format: "page" as const } : {}),
    };
  return undefined;
}

function band(value: unknown): PageBand | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const out: PageBand = {};
  for (const position of ["left", "center", "right"] as const) {
    const slot = bandSlot(raw[position]);
    if (slot) out[position] = slot;
  }
  if (!out.left && !out.center && !out.right) return undefined;
  if (raw.skipFirstPage === true) out.skipFirstPage = true;
  return out;
}

function pageSettings(value: unknown): PageSettings | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const margins = (raw.margins ?? {}) as Record<string, unknown>;
  const margin = (n: unknown, fallback: number) =>
    typeof n === "number" && Number.isInteger(n) && n >= 10 && n <= 50
      ? n
      : fallback;
  const d = DEFAULT_PAGE.margins;
  return compactPage({
    size: raw.size === "legal" || raw.size === "a4" ? raw.size : "letter",
    margins: {
      top: margin(margins.top, d.top),
      right: margin(margins.right, d.right),
      bottom: margin(margins.bottom, d.bottom),
      left: margin(margins.left, d.left),
    },
    font: raw.font === "sans" ? "sans" : "serif",
    fontSize: (FONT_SIZES as readonly number[]).includes(raw.fontSize as number)
      ? (raw.fontSize as number)
      : DEFAULT_PAGE.fontSize,
    lineHeight: (LINE_HEIGHTS as readonly number[]).includes(
      raw.lineHeight as number,
    )
      ? (raw.lineHeight as number)
      : DEFAULT_PAGE.lineHeight,
  });
}

function docAttrs(value: unknown): DocAttrs | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const page = pageSettings(raw.page);
  const header = band(raw.header);
  const footer = band(raw.footer);
  const out: DocAttrs = {
    ...(page ? { page } : {}),
    ...(header ? { header } : {}),
    ...(footer ? { footer } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

export function sanitizeRichDoc(json: unknown): RichDoc {
  const root = (json ?? {}) as Loose;
  const attrs = docAttrs(root.attrs);
  const content = children(root).flatMap(block);
  return {
    type: "doc",
    ...(attrs ? { attrs } : {}),
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

/** Empty paragraphs at the end are not content: the editor adds one so the cursor can go below a table. */
function withoutTrailingEmpty(doc: RichDoc): RichDoc {
  const content = [...doc.content];
  while (content.length > 1) {
    const last = content[content.length - 1];
    if (last.type !== "paragraph" || (last.content?.length ?? 0) > 0 || last.attrs) break;
    content.pop();
  }
  return { ...doc, content };
}

/**
 * True when two documents have the same content and formatting, ignoring how they were serialized
 * (attribute order, defaults, mark order) and trailing empty paragraphs. Used for «unsaved changes».
 */
export function sameDocument(a: unknown, b: unknown): boolean {
  return (
    JSON.stringify(withoutTrailingEmpty(sanitizeRichDoc(a))) ===
    JSON.stringify(withoutTrailingEmpty(sanitizeRichDoc(b)))
  );
}
