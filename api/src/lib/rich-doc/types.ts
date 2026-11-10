export type ContentFormat = "plain" | "rich-v1" | "rich-v2";
export interface PageSettings {
  size?: "letter" | "legal" | "a4";
  margins?: { top: number; right: number; bottom: number; left: number };
  font?: "serif" | "sans";
  fontSize?: number;
  lineHeight?: number;
}
export type BandSlot =
  | { kind: "text"; text: string; size?: number }
  | { kind: "logo"; height?: number }
  | { kind: "pageNumber"; format?: "page" | "pageOfTotal" };
export interface PageBand {
  left?: BandSlot;
  center?: BandSlot;
  right?: BandSlot;
  skipFirstPage?: boolean;
}
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
    page?: PageSettings;
    header?: PageBand;
    footer?: PageBand;
    numbered?: "ordinal" | "decimal";
    columns?: 1 | 2 | 3;
    label?: string;
    showName?: boolean;
    showId?: boolean;
  };
  text?: string;
  marks?: { type: MarkType }[];
  content?: RichNode[];
}
export interface RichDoc extends RichNode {
  type: "doc";
  content: RichNode[];
}
