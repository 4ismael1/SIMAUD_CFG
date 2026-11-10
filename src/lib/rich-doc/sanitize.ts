import type {
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
  return seen.size > 0 ? { marks: [...seen].map((type) => ({ type })) } : {};
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
      return [
        withContent(
          {
            type: "heading" as const,
            attrs: { level, ...(align ? { textAlign: align } : {}) },
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
        { type: "blockquote" | "horizontalRule" | "pageBreak" | "table" }
      >[];
      return content.length > 0 ? [{ type: "blockquote", content }] : [];
    }
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

export function sanitizeRichDoc(json: unknown): RichDoc {
  const root = (json ?? {}) as Loose;
  const content = children(root).flatMap(block);
  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}
