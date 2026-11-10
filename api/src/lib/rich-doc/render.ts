import { formatVariable, type Variable } from "../render-template.js";
import type { RichDoc, RichNode } from "./types.js";

export function extractVariables(document: RichDoc): string[] {
  const names = new Set<string>();
  function visit(node: RichNode) {
    if (node.type === "variable") names.add(node.attrs!.name!);
    node.content?.forEach(visit);
  }
  visit(document);
  return [...names];
}

export function renderRichDoc(
  document: RichDoc,
  values: Record<string, unknown>,
  defs: Variable[] = [],
) {
  const missing = new Set<string>();
  function render(node: RichNode): RichNode {
    if (node.type === "variable") {
      const name = node.attrs!.name!;
      const value = values[name];
      if (value === undefined || value === null || value === "") {
        missing.add(name);
        return node;
      }
      return {
        type: "text",
        text: formatVariable(
          value,
          defs.find((def) => def.name === name),
          name,
        ),
        ...(node.marks ? { marks: node.marks } : {}),
      };
    }
    return { ...node, ...(node.content ? { content: node.content.map(render) } : {}) };
  }
  return { document: render(document) as RichDoc, missing: [...missing] };
}

export function richDocText(node: RichNode): string {
  if (node.type === "text") return node.text!;
  if (node.type === "variable") return "{{" + node.attrs!.name + "}}";
  if (["hardBreak", "pageBreak", "horizontalRule"].includes(node.type)) return "\n";
  const separator = ["paragraph", "heading"].includes(node.type)
    ? ""
    : node.type === "tableRow"
      ? "\t"
      : "\n";
  return (node.content ?? []).map(richDocText).join(separator);
}
