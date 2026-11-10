import { Node, mergeAttributes, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from "@tiptap/extension-table";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { CharacterCount, Placeholder } from "@tiptap/extensions";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    variable: {
      /** Insert a variable chip at the cursor (replacing the selection). */
      insertVariable: (name: string) => ReturnType;
    };
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
  }
}

export interface VariableNodeOptions {
  /** Readable label for a variable name; undefined when the variable does not exist. */
  labelFor: (name: string) => string | undefined;
}

/** Draw a chip: the variable's label, or its name in amber when it does not exist. */
export function paintVariableChip(
  dom: HTMLElement,
  name: string,
  labelFor: VariableNodeOptions["labelFor"],
) {
  const label = labelFor(name);
  dom.setAttribute("data-variable", name);
  dom.classList.toggle("is-unknown", !label);
  dom.title = label
    ? `{{${name}}}`
    : `{{${name}}}: este dato no existe todavía`;
  dom.textContent = `[${label ?? name}]`;
}

/** Repaint every chip in the editor (after the variable catalogue loads or changes). */
export function repaintVariableChips(
  root: HTMLElement,
  labelFor: VariableNodeOptions["labelFor"],
) {
  root
    .querySelectorAll<HTMLElement>("[data-variable]")
    .forEach((dom) =>
      paintVariableChip(dom, dom.getAttribute("data-variable") ?? "", labelFor),
    );
}

/** Inline, atomic chip for a template variable. Stored as { type: "variable", attrs: { name } }. */
export const VariableNode = Node.create<VariableNodeOptions>({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { labelFor: () => undefined };
  },

  addAttributes() {
    return {
      name: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-variable") ?? "",
        renderHTML: (attributes) => ({ "data-variable": attributes.name }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-variable]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const name = String(node.attrs.name);
    const label = this.options.labelFor(name);
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: label ? undefined : "is-unknown",
        title: label ? `{{${name}}}` : `{{${name}}}: esta variable no existe`,
      }),
      `[${label ?? name}]`,
    ];
  },

  // Own DOM view so labels can be repainted in place when the variable catalogue changes
  // (ProseMirror keeps the DOM of unchanged nodes, so re-rendering the document would not update them).
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      let current = node;
      const paint = () =>
        paintVariableChip(
          dom,
          String(current.attrs.name),
          this.options.labelFor,
        );
      paint();
      return {
        dom,
        update: (next) => {
          if (next.type !== current.type) return false;
          current = next;
          paint();
          return true;
        },
      };
    };
  },

  // Copying a chip as plain text gives the placeholder back.
  renderText({ node }) {
    return `{{${String(node.attrs.name)}}}`;
  },

  addCommands() {
    return {
      insertVariable:
        (name) =>
        ({ tr, commands }) => {
          // Never glue the chip to the previous word: "PRESTACIÓN[Fecha]" → "PRESTACIÓN [Fecha]".
          const before = tr.selection.$from.nodeBefore;
          const needsSpace = Boolean(
            before?.isText && /\S$/.test(before.text ?? ""),
          );
          return commands.insertContent([
            ...(needsSpace ? [{ type: "text", text: " " }] : []),
            { type: this.name, attrs: { name } },
            { type: "text", text: " " },
          ]);
        },
    };
  },
});

/** Forced page break in the PDF. Stored as { type: "pageBreak" }. */
export const PageBreakNode = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-page-break": "",
        role: "separator",
        "aria-label": "Salto de página",
      }),
    ];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).run(),
    };
  },
});

/**
 * Tables with an optional `borderless` flag: columns without lines, the reliable way to lay out
 * signature blocks side by side (spaces would misalign in the PDF and on phones).
 * Column resizing is off on purpose: widths split evenly, which the PDF reproduces exactly.
 */
const ContractTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      borderless: {
        default: false,
        parseHTML: (element) => element.hasAttribute("data-borderless"),
        renderHTML: (attributes) =>
          attributes.borderless ? { "data-borderless": "" } : {},
      },
    };
  },
}).configure({ resizable: false });

export const MAX_DOCUMENT_CHARACTERS = 200_000;

/** Only what docs/RICH_DOC_FORMAT.md allows: no code, links or images. */
export function editorExtensions(
  labelFor: VariableNodeOptions["labelFor"],
): Extensions {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      link: false,
      heading: { levels: [1, 2, 3] },
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right", "justify"],
    }),
    ContractTable,
    TableRow,
    TableHeader,
    TableCell,
    Highlight,
    Subscript,
    Superscript,
    Placeholder.configure({
      placeholder:
        "Escribe el texto del contrato… Teclea «{{» para insertar un dato.",
    }),
    CharacterCount.configure({ limit: MAX_DOCUMENT_CHARACTERS }),
    VariableNode.configure({ labelFor }),
    PageBreakNode,
  ];
}
