import type { BlockNode, InlineNode, RichDoc, RichMark } from "./types";
export { sanitizeRichDoc } from "./sanitize";

const VARIABLE_PATTERN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

/** Text with `{{name}}` placeholders → text and variable nodes, all carrying the same marks. */
function inlineWithVariables(text: string, marks: RichMark[]): InlineNode[] {
  const nodes: InlineNode[] = [];
  const withMarks = marks.length > 0 ? { marks } : {};
  let last = 0;
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last)
      nodes.push({ type: "text", text: text.slice(last, index), ...withMarks });
    nodes.push({ type: "variable", attrs: { name: match[1] }, ...withMarks });
    last = index + match[0].length;
  }
  if (last < text.length)
    nodes.push({ type: "text", text: text.slice(last), ...withMarks });
  return nodes;
}

/** One paragraph of the old format: `**bold**` segments, single line breaks kept as hard breaks. */
function paragraphInline(paragraph: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  paragraph.split("\n").forEach((line, lineIndex) => {
    if (lineIndex > 0) nodes.push({ type: "hardBreak" });
    for (const part of line.split(/(\*\*[^*]+\*\*)/g)) {
      if (!part) continue;
      const bold =
        part.startsWith("**") && part.endsWith("**") && part.length > 4;
      nodes.push(
        ...inlineWithVariables(
          bold ? part.slice(2, -2) : part,
          bold ? [{ type: "bold" }] : [],
        ),
      );
    }
  });
  return nodes;
}

/**
 * Convert a template written in the old plain format (blank line between clauses, `**bold**`, `{{variable}}`)
 * into a formatted document, so it can be opened in the new editor without losing anything.
 */
export function plainToRichDoc(plain: string): RichDoc {
  const blocks: BlockNode[] = plain
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      type: "paragraph",
      content: paragraphInline(paragraph),
    }));
  return {
    type: "doc",
    content: blocks.length > 0 ? blocks : [{ type: "paragraph" }],
  };
}

/**
 * Formatted document → old plain format, for servers that do not support `rich-v1` yet.
 * Keeps paragraphs, bold, variables and line breaks; lists and tables become text lines.
 */
export function richDocToPlain(doc: RichDoc): string {
  const inlineText = (nodes: InlineNode[] | undefined): string =>
    (nodes ?? [])
      .map((node) => {
        if (node.type === "hardBreak") return "\n";
        const text =
          node.type === "variable" ? `{{${node.attrs.name}}}` : node.text;
        return node.marks?.some((mark) => mark.type === "bold") && text.trim()
          ? `**${text}**`
          : text;
      })
      .join("");

  const blockText = (block: BlockNode, prefix = ""): string[] => {
    switch (block.type) {
      case "paragraph":
      case "heading":
        return [prefix + inlineText(block.content)];
      case "bulletList":
      case "orderedList":
        return block.content.flatMap((item, index) => {
          const marker =
            block.type === "bulletList"
              ? "- "
              : `${(block.attrs?.start ?? 1) + index}. `;
          const [first, ...rest] = item.content.flatMap((child) =>
            blockText(child, ""),
          );
          return [
            prefix + marker + (first ?? ""),
            ...rest.map((line) => prefix + "   " + line),
          ];
        });
      case "blockquote":
        return block.content.flatMap((child) => blockText(child, prefix));
      case "table":
        return block.content.map((row) =>
          row.content
            .map((cell) =>
              cell.content.flatMap((child) => blockText(child)).join(" "),
            )
            .join(" | "),
        );
      default:
        return [];
    }
  };

  return doc.content
    .map((block) => blockText(block).join("\n"))
    .filter((text) => text.trim())
    .join("\n\n");
}

/** Variable names in order of first appearance. */
export function richDocVariables(doc: RichDoc): string[] {
  const names = new Set<string>();
  const visit = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const value = node as {
      type?: string;
      attrs?: { name?: string };
      content?: unknown[];
    };
    if (value.type === "variable" && value.attrs?.name)
      names.add(value.attrs.name);
    value.content?.forEach(visit);
  };
  visit(doc);
  return [...names];
}

/** Plain text of the document (for length checks and search). */
export function richDocText(doc: RichDoc): string {
  const parts: string[] = [];
  const visit = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const value = node as {
      type?: string;
      text?: string;
      attrs?: { name?: string };
      content?: unknown[];
    };
    if (value.type === "text" && value.text) parts.push(value.text);
    else if (value.type === "variable")
      parts.push(`{{${value.attrs?.name ?? ""}}}`);
    value.content?.forEach(visit);
    if (value.type === "paragraph" || value.type === "heading")
      parts.push("\n");
  };
  visit(doc);
  return parts.join("").trim();
}

/**
 * Stored document → the JSON the editor loads. Only the signature block differs: stored with one
 * `signatureSlot` child per box, edited as a single atom with `attrs.slots` (see SignaturesNode).
 */
export function toEditorJson(doc: RichDoc): Record<string, unknown> {
  const convert = (node: unknown): unknown => {
    if (typeof node !== "object" || node === null) return node;
    const value = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] };
    if (value.type === "signatures") {
      const slots = (value.content ?? []).map((slot) => (slot as { attrs?: Record<string, unknown> }).attrs ?? { label: "" });
      return { type: "signatures", attrs: { columns: value.attrs?.columns ?? 2, slots } };
    }
    return value.content ? { ...value, content: value.content.map(convert) } : value;
  };
  return convert(doc) as Record<string, unknown>;
}

const ORDINALS_ES = [
  "PRIMERA", "SEGUNDA", "TERCERA", "CUARTA", "QUINTA", "SEXTA", "SÉPTIMA", "OCTAVA", "NOVENA", "DÉCIMA",
  "UNDÉCIMA", "DUODÉCIMA", "DECIMOTERCERA", "DECIMOCUARTA", "DECIMOQUINTA", "DECIMOSEXTA", "DECIMOSÉPTIMA",
  "DECIMOCTAVA", "DECIMONOVENA", "VIGÉSIMA",
];

/** "PRIMERA." / "1." — the same numbers the CSS counters draw (decimal past VIGÉSIMA here). */
export function clauseNumber(index: number, style: "ordinal" | "decimal"): string {
  return style === "ordinal" && index <= ORDINALS_ES.length ? `${ORDINALS_ES[index - 1]}.` : `${index}.`;
}

/**
 * rich-v2 → rich-v1, for APIs that do not store v2 yet: page set-up is dropped, numbered clauses get
 * their number as text, and signature blocks become borderless tables with lines and labels.
 */
export function richDocToV1(doc: RichDoc): RichDoc {
  const counters = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>;
  let signer = 0;
  const centred = { textAlign: "center" as const };

  const convert = (block: BlockNode): BlockNode => {
    if (block.type === "heading" && block.attrs.numbered) {
      const level = block.attrs.level;
      counters[level] += 1;
      const prefix: InlineNode = { type: "text", text: `${clauseNumber(counters[level], block.attrs.numbered)} ` };
      const attrs = { ...block.attrs };
      delete attrs.numbered;
      return { ...block, attrs, content: [prefix, ...(block.content ?? [])] };
    }
    if (block.type === "signatures") {
      const columns = block.attrs?.columns ?? 2;
      const cells = block.content.map((slot) => {
        signer += 1;
        const lines: BlockNode[] = [
          { type: "paragraph", attrs: centred },
          { type: "paragraph", attrs: centred, content: [{ type: "text", text: "______________________" }] },
        ];
        if (slot.attrs.showName !== false) lines.push({ type: "paragraph", attrs: centred, content: [{ type: "text", text: `[Firmante ${signer}]` }] });
        if (slot.attrs.label) lines.push({ type: "paragraph", attrs: centred, content: [{ type: "text", text: slot.attrs.label, marks: [{ type: "bold" }] }] });
        return { type: "tableCell" as const, content: lines as never };
      });
      const rows = [];
      for (let i = 0; i < cells.length; i += columns) {
        const row = cells.slice(i, i + columns);
        // Tables need full rows: pad the last one with empty boxes.
        while (row.length < columns) row.push({ type: "tableCell" as const, content: [{ type: "paragraph" }] as never });
        rows.push({ type: "tableRow" as const, content: row });
      }
      return { type: "table", attrs: { borderless: true }, content: rows };
    }
    if ("content" in block && Array.isArray(block.content) && block.type === "blockquote") {
      return { ...block, content: block.content.map(convert) as never };
    }
    return block;
  };

  return { type: "doc", content: doc.content.map(convert) };
}
