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
