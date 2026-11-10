export type ContentFormat = "plain" | "rich-v1";
export type MarkType =
  "bold" | "italic" | "underline" | "strike" | "superscript" | "subscript" | "highlight";
export interface RichNode {
  type: string;
  attrs?: {
    textAlign?: "left" | "center" | "right" | "justify";
    level?: number;
    start?: number;
    borderless?: true;
    colspan?: number;
    rowspan?: number;
    colwidth?: number[];
    name?: string;
  };
  text?: string;
  marks?: { type: MarkType }[];
  content?: RichNode[];
}
export interface RichDoc extends RichNode {
  type: "doc";
  content: RichNode[];
}
