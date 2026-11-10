/**
 * Formatted document, format `rich-v1` (see docs/RICH_DOC_FORMAT.md).
 * A strict subset of the ProseMirror/TipTap JSON: it is never HTML, and both the editor and the
 * viewer only understand the nodes and marks listed here.
 */

export type ContentFormat = "plain" | "rich-v1";

export type TextAlign = "left" | "center" | "right" | "justify";

export type MarkType =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "superscript"
  | "subscript"
  | "highlight";

export interface RichMark {
  type: MarkType;
}

export interface TextNode {
  type: "text";
  text: string;
  marks?: RichMark[];
}

export interface HardBreakNode {
  type: "hardBreak";
}

export interface VariableNode {
  type: "variable";
  attrs: { name: string };
  marks?: RichMark[];
}

export type InlineNode = TextNode | HardBreakNode | VariableNode;

export interface ParagraphNode {
  type: "paragraph";
  attrs?: { textAlign?: TextAlign | null };
  content?: InlineNode[];
}

export interface HeadingNode {
  type: "heading";
  attrs: { level: 1 | 2 | 3; textAlign?: TextAlign | null };
  content?: InlineNode[];
}

export interface ListItemNode {
  type: "listItem";
  content: (ParagraphNode | BulletListNode | OrderedListNode)[];
}

export interface BulletListNode {
  type: "bulletList";
  content: ListItemNode[];
}

export interface OrderedListNode {
  type: "orderedList";
  attrs?: { start?: number | null };
  content: ListItemNode[];
}

export interface BlockquoteNode {
  type: "blockquote";
  content: (ParagraphNode | HeadingNode | BulletListNode | OrderedListNode)[];
}

export interface HorizontalRuleNode {
  type: "horizontalRule";
}

export interface PageBreakNode {
  type: "pageBreak";
}

export interface TableCellNode {
  type: "tableCell" | "tableHeader";
  attrs?: {
    colspan?: number | null;
    rowspan?: number | null;
    colwidth?: number[] | null;
  };
  content: (ParagraphNode | BulletListNode | OrderedListNode)[];
}

export interface TableRowNode {
  type: "tableRow";
  content: TableCellNode[];
}

export interface TableNode {
  type: "table";
  /** borderless: columns without lines (signature blocks). */
  attrs?: { borderless?: boolean | null };
  content: TableRowNode[];
}

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode
  | BlockquoteNode
  | HorizontalRuleNode
  | PageBreakNode
  | TableNode;

export interface RichDoc {
  type: "doc";
  content: BlockNode[];
}

/** What the API may send as a contract or template body: escaped plain text, or a formatted document. */
export type DocumentContent = string | RichDoc;

export function isRichDoc(value: unknown): value is RichDoc {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "doc" &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

export const EMPTY_RICH_DOC: RichDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
