import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { cn } from "../../../ui";
import type { Variable } from "../../../lib/api/catalog-types";
import { normalizeText } from "../catalog-filters";
import { sanitizeRichDoc } from "../../../lib/rich-doc/sanitize";
import { toEditorJson } from "../../../lib/rich-doc/convert";
import type { DocAttrs, RichDoc } from "../../../lib/rich-doc/types";
import {
  compactPage,
  isBandEmpty,
  resolvePage,
} from "../../../lib/rich-doc/page";
import { Sheet } from "../../../lib/rich-doc/Sheet";
import { PageSetupDialog } from "./PageSetupDialog";
import { EditorToolbar } from "./EditorToolbar";
import { SelectionToolbar } from "./SelectionToolbar";
import { SLASH_COMMANDS, type SlashCommand } from "./slash-commands";
import {
  MAX_DOCUMENT_CHARACTERS,
  editorExtensions,
  repaintVariableChips,
} from "./extensions";

const MAX_SUGGESTIONS = 8;
const VARIABLE_NAME = /^[a-z][a-z0-9_]{1,49}$/;

interface SuggestState {
  /** "variable": typed «{{» (data fields); "command": typed «/» (insert a block). */
  mode: "variable" | "command";
  query: string;
  /** Document range of the typed "{{query", replaced by the chip. */
  from: number;
  to: number;
  index: number;
  /** Caret box in viewport coordinates, to place the list below (or above) it. */
  left: number;
  caretTop: number;
  caretBottom: number;
  /** Opened from the toolbar button: nothing was typed, so it stays open until a choice, Escape or a move. */
  manual?: boolean;
}

type SuggestOption =
  | { kind: "variable"; variable: Variable }
  | { kind: "create"; name: string }
  | { kind: "command"; command: SlashCommand };

interface RichTextEditorProps {
  /** Initial document; later changes of this prop are ignored (the editor owns its state). */
  initialValue: RichDoc;
  onChange: (doc: RichDoc) => void;
  variables: Variable[];
  /** Open the "new variable" drawer, prefilled with a name when there is one. */
  onCreateVariable?: (name: string) => void;
  invalid?: boolean;
  label: string;
}

/** Word-processor style editor for contract templates (format rich-v1). */
export function RichTextEditor({
  initialValue,
  onChange,
  variables,
  onCreateVariable,
  invalid = false,
  label,
}: RichTextEditorProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [suggest, setSuggest] = useState<SuggestState | null>(null);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const labels = useMemo(
    () => new Map(variables.map((variable) => [variable.name, variable.label])),
    [variables],
  );
  // Read by the chips when they render; kept in sync below (the extension is created once).
  const [labelStore] = useState(() => new Map<string, string>());
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    labelStore.clear();
    for (const [name, text] of labels) labelStore.set(name, text);
  });

  const suggestMode = suggest?.mode;
  const suggestQuery = suggest?.query ?? "";
  const canCreate = Boolean(onCreateVariable);
  const options = useMemo(
    () =>
      suggestMode === "command"
        ? buildCommandOptions(suggestQuery)
        : buildOptions(suggestQuery, variables, canCreate),
    [suggestMode, suggestQuery, variables, canCreate],
  );
  // Refs let ProseMirror's key handler (registered once) see the current popup.
  const popupRef = useRef<{
    suggest: SuggestState | null;
    options: SuggestOption[];
  }>({ suggest: null, options: [] });
  useLayoutEffect(() => {
    popupRef.current = { suggest, options };
  });

  const editor = useEditor({
    extensions: editorExtensions((name) => labelStore.get(name)),
    content: toEditorJson(initialValue),
    editorProps: {
      attributes: {
        class: "rich-content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        spellcheck: "true",
        lang: "es",
      },
      handleKeyDown: (_view, event) => handleSuggestKey(event),
    },
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(sanitizeRichDoc(current.getJSON()));
      detectSuggestion(current);
    },
    onSelectionUpdate: ({ editor: current }) => detectSuggestion(current),
    onBlur: () => window.setTimeout(() => setSuggest(null), 150),
  });

  // Page set-up lives in the document's own attributes, so undo/redo covers it too.
  const docAttrs =
    useEditorState({
      editor,
      selector: ({ editor: current }) => {
        const attrs = current?.state.doc.attrs ?? {};
        return {
          page: attrs.page ?? undefined,
          header: attrs.header ?? undefined,
          footer: attrs.footer ?? undefined,
        } as DocAttrs;
      },
      equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    }) ?? {};

  // Chips render their label when created; redraw them once the variable catalogue arrives or changes.
  const labelsKey = useMemo(
    () => [...labels].map(([name, text]) => `${name}=${text}`).join("|"),
    [labels],
  );
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    repaintVariableChips(editor.view.dom, (name) => labelStore.get(name));
  }, [editor, labelsKey, labelStore]);

  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !popupRef.current.suggest)
        setFullscreen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  function detectSuggestion(current: Editor) {
    const { selection } = current.state;
    if (!selection.empty) return setSuggest(null);
    const { $from } = selection;
    const before = $from.parent.textBetween(
      Math.max(0, $from.parentOffset - 60),
      $from.parentOffset,
      undefined,
      "￼",
    );
    const match = before.match(/\{\{\s*([a-z0-9_]*)$/i);
    // «/» at the start of a line or after a space opens the block menu.
    const slash = match ? null : before.match(/(^|\s)\/([\p{L} ]{0,24})$/u);
    if (slash) {
      const coords = current.view.coordsAtPos(selection.from);
      const typed = slash[0].length - slash[1].length;
      setSuggest((previous) => ({
        mode: "command",
        query: slash[2],
        from: selection.from - typed,
        to: selection.from,
        index:
          previous?.mode === "command" && previous.query === slash[2]
            ? previous.index
            : 0,
        left: coords.left,
        caretTop: coords.top,
        caretBottom: coords.bottom,
      }));
      return;
    }
    if (!match) {
      // A list opened from the toolbar survives until the cursor moves away.
      setSuggest((previous) =>
        previous?.manual && previous.from === selection.from ? previous : null,
      );
      return;
    }
    const coords = current.view.coordsAtPos(selection.from);
    setSuggest((previous) => ({
      mode: "variable",
      query: match[1].toLowerCase(),
      from: selection.from - match[0].length,
      to: selection.from,
      index:
        previous && previous.query === match[1].toLowerCase()
          ? previous.index
          : 0,
      left: coords.left,
      caretTop: coords.top,
      caretBottom: coords.bottom,
    }));
  }

  /** "Insertar dato": open the list at the cursor without typing anything into the document. */
  function openVariableList() {
    if (!editor) return;
    editor.commands.focus();
    const { from } = editor.state.selection;
    const coords = editor.view.coordsAtPos(from);
    setSuggest({
      mode: "variable",
      query: "",
      from,
      to: from,
      index: 0,
      left: coords.left,
      caretTop: coords.top,
      caretBottom: coords.bottom,
      manual: true,
    });
  }

  // Keep the list next to the caret while the page or the full-screen area scrolls.
  const suggestOpen = suggest !== null;
  useEffect(() => {
    if (!suggestOpen || !editor) return;
    const view = editor.view;
    function reposition() {
      const current = popupRef.current.suggest;
      if (!current) return;
      const coords = view.coordsAtPos(
        Math.min(current.to, view.state.doc.content.size),
      );
      setSuggest({
        ...current,
        left: coords.left,
        caretTop: coords.top,
        caretBottom: coords.bottom,
      });
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [suggestOpen, editor]);

  function choose(option: SuggestOption | undefined) {
    const current = popupRef.current.suggest;
    if (!editor || !option || !current) return;
    if (option.kind === "command") {
      editor
        .chain()
        .focus()
        .deleteRange({ from: current.from, to: current.to })
        .run();
      setSuggest(null);
      option.command.run(editor, { openVariableList });
      return;
    }
    if (option.kind === "variable") {
      editor
        .chain()
        .focus()
        .deleteRange({ from: current.from, to: current.to })
        .insertVariable(option.variable.name)
        .run();
    } else {
      editor
        .chain()
        .focus()
        .deleteRange({ from: current.from, to: current.to })
        .run();
      onCreateVariable?.(option.name);
    }
    setSuggest(null);
  }

  function handleSuggestKey(event: KeyboardEvent): boolean {
    const { suggest: current, options: list } = popupRef.current;
    if (!current || list.length === 0) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setSuggest({
        ...current,
        index: (current.index + delta + list.length) % list.length,
      });
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      choose(list[current.index]);
      return true;
    }
    if (event.key === "Escape") {
      setSuggest(null);
      return true;
    }
    return false;
  }

  function applyDocAttrs(value: DocAttrs) {
    if (!editor) return;
    const page = compactPage(resolvePage(value.page));
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setDocAttribute("page", page ?? null);
        tr.setDocAttribute(
          "header",
          isBandEmpty(value.header) ? null : value.header,
        );
        tr.setDocAttribute(
          "footer",
          isBandEmpty(value.footer) ? null : value.footer,
        );
        return true;
      })
      .run();
  }

  if (!editor) return null;

  const body = (
    <div
      className={cn(
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-slate-100"
          : "rounded-lg border bg-white transition-colors focus-within:border-slate-400",
        !fullscreen && (invalid ? "border-red-400" : "border-slate-300"),
      )}
    >
      <div
        className={cn(
          "z-10",
          fullscreen ? "shadow-sm" : "sticky top-[57px] rounded-t-lg",
        )}
      >
        <EditorToolbar
          editor={editor}
          fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen((value) => !value)}
          onInsertVariable={openVariableList}
          onOpenPageSetup={() => setPageSetupOpen(true)}
        />
      </div>
      {/* The «desk»: grey background with the sheet of paper on it, like a word processor. */}
      <div
        className={cn(
          "bg-slate-100 px-2 py-6 sm:px-6 sm:py-8",
          fullscreen ? "min-h-0 flex-1 overflow-y-auto" : "",
        )}
      >
        <Sheet attrs={docAttrs} showPageBreaks>
          <EditorContent editor={editor} />
          <SelectionToolbar editor={editor} />
        </Sheet>
      </div>
      {pageSetupOpen && (
        <PageSetupDialog
          open
          value={docAttrs}
          onClose={() => setPageSetupOpen(false)}
          onApply={applyDocAttrs}
        />
      )}
      <EditorFooter editor={editor} fullscreen={fullscreen} />
      {suggest &&
        options.length > 0 &&
        // In <body>, like full screen: an animated ancestor would otherwise trap `position: fixed`.
        createPortal(
          <SuggestionList
            options={options}
            activeIndex={suggest.index}
            left={suggest.left}
            caretTop={suggest.caretTop}
            caretBottom={suggest.caretBottom}
            onChoose={choose}
          />,
          document.body,
        )}
    </div>
  );

  // Full screen goes to <body>: an animated ancestor (page transitions) would otherwise trap `position: fixed`
  // inside the page, under the app header and sidebar.
  return fullscreen ? createPortal(body, document.body) : body;
}

function buildCommandOptions(query: string): SuggestOption[] {
  const needle = normalizeText(query);
  return SLASH_COMMANDS.filter(
    (command) =>
      !needle ||
      normalizeText(command.label).includes(needle) ||
      normalizeText(command.keywords).includes(needle),
  ).map((command): SuggestOption => ({ kind: "command", command }));
}

function buildOptions(
  query: string,
  variables: Variable[],
  canCreate: boolean,
): SuggestOption[] {
  const needle = normalizeText(query);
  const matches = variables
    .filter(
      (variable) =>
        !needle ||
        variable.name.includes(needle) ||
        normalizeText(variable.label).includes(needle),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map((variable): SuggestOption => ({ kind: "variable", variable }));
  const exists = variables.some((variable) => variable.name === query);
  if (canCreate && VARIABLE_NAME.test(query) && !exists)
    matches.push({ kind: "create", name: query });
  return matches;
}

const LIST_MAX_HEIGHT = 288;
const LIST_GAP = 6;

interface SuggestionListProps {
  options: SuggestOption[];
  activeIndex: number;
  left: number;
  caretTop: number;
  caretBottom: number;
  onChoose: (option: SuggestOption) => void;
}

function SuggestionList({
  options,
  activeIndex,
  left: caretLeft,
  caretTop,
  caretBottom,
  onChoose,
}: SuggestionListProps) {
  // Stay on screen: shift left on narrow phones, open above the caret when there is no room below.
  const left = Math.max(8, Math.min(caretLeft, window.innerWidth - 300));
  const roomBelow = window.innerHeight - caretBottom - LIST_GAP;
  const placement =
    roomBelow >= Math.min(LIST_MAX_HEIGHT, 160) || roomBelow >= caretTop
      ? { top: caretBottom + LIST_GAP }
      : { bottom: window.innerHeight - caretTop + LIST_GAP };
  return (
    <ul
      role="listbox"
      aria-label={
        options[0]?.kind === "command"
          ? "Insertar bloque"
          : "Datos del contrato"
      }
      style={{ left, ...placement }}
      className="fixed z-[60] max-h-72 w-[min(292px,calc(100vw-16px))] animate-pop-in overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-pop"
    >
      {options.map((option, index) => (
        <li
          key={
            option.kind === "variable"
              ? option.variable.id
              : option.kind === "command"
                ? option.command.id
                : `create-${option.name}`
          }
          role="option"
          aria-selected={index === activeIndex}
        >
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              onChoose(option);
            }}
            className={cn(
              "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
              index === activeIndex ? "bg-vino-50" : "hover:bg-slate-50",
            )}
          >
            {option.kind === "command" ? (
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 [&_svg]:size-4">
                  <option.command.icon />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-slate-900">
                    {option.command.label}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {option.command.hint}
                  </span>
                </span>
              </span>
            ) : option.kind === "variable" ? (
              <>
                <span className="truncate">{option.variable.label}</span>
                <span className="shrink-0 font-mono text-[11px] text-slate-400">
                  {option.variable.name}
                </span>
              </>
            ) : (
              <span className="flex items-center gap-2 text-vino-700">
                <Plus className="size-4" />
                Crear dato{" "}
                <span className="font-mono text-xs">{option.name}</span>
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function EditorFooter({
  editor,
  fullscreen,
}: {
  editor: Editor;
  fullscreen: boolean;
}) {
  const counts = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      words: current.storage.characterCount.words() as number,
      characters: current.storage.characterCount.characters() as number,
    }),
  });
  const nearLimit = counts.characters > MAX_DOCUMENT_CHARACTERS * 0.9;
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-3 border-t sm:justify-between border-slate-200 px-4 py-2 text-xs text-slate-500",
        fullscreen ? "bg-white" : "rounded-b-lg bg-white",
      )}
    >
      <span className="hidden sm:inline">
        Teclea{" "}
        <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-mono">
          {"{{"}
        </kbd>{" "}
        para insertar un dato
      </span>
      <span className={cn(nearLimit && "font-medium text-amber-700")}>
        {counts.words.toLocaleString("es-DO")} palabras ·{" "}
        {counts.characters.toLocaleString("es-DO")} caracteres
      </span>
    </div>
  );
}
