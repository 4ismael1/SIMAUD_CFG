import type { Editor } from "@tiptap/react";
import {
  Braces,
  Columns2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListOrdered as ClauseIcon,
  Minus,
  Pilcrow,
  Quote,
  SeparatorHorizontal,
  Signature,
  Table,
  type LucideIcon,
} from "lucide-react";

/**
 * Commands of the «/» menu: type «/» at the start of a line (or after a space) and pick a block.
 * `run` receives the editor with the «/query» text already removed.
 */
export interface SlashCommand {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Extra words the filter matches (accent-insensitive). */
  keywords: string;
  run: (editor: Editor, helpers: { openVariableList: () => void }) => void;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "clause",
    label: "Cláusula",
    hint: "PRIMERA., SEGUNDA… se numeran solas",
    icon: ClauseIcon,
    keywords: "clausula titulo numerada primera",
    run: (editor) =>
      editor
        .chain()
        .focus()
        .setHeading({ level: 2 })
        .updateAttributes("heading", { numbered: "ordinal" })
        .run(),
  },
  {
    id: "clause-decimal",
    label: "Cláusula numerada (1.)",
    hint: "1., 2., 3.…",
    icon: ClauseIcon,
    keywords: "clausula numero decimal",
    run: (editor) =>
      editor
        .chain()
        .focus()
        .setHeading({ level: 2 })
        .updateAttributes("heading", { numbered: "decimal" })
        .run(),
  },
  {
    id: "data",
    label: "Dato del contrato",
    hint: "Nombre del cliente, fechas, importes…",
    icon: Braces,
    keywords: "variable dato campo",
    run: (_editor, { openVariableList }) => openVariableList(),
  },
  {
    id: "signatures",
    label: "Firmas",
    hint: "Casillas de firma, una por firmante",
    icon: Signature,
    keywords: "firma firmantes rubrica",
    run: (editor) => editor.chain().focus().insertSignatures().run(),
  },
  {
    id: "text",
    label: "Texto",
    hint: "Párrafo normal",
    icon: Pilcrow,
    keywords: "parrafo normal",
    run: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    id: "h1",
    label: "Título 1",
    hint: "Título principal",
    icon: Heading1,
    keywords: "encabezado grande",
    run: (editor) =>
      editor
        .chain()
        .focus()
        .setHeading({ level: 1 })
        .updateAttributes("heading", { numbered: null })
        .run(),
  },
  {
    id: "h2",
    label: "Título 2",
    hint: "Sección",
    icon: Heading2,
    keywords: "encabezado seccion",
    run: (editor) =>
      editor
        .chain()
        .focus()
        .setHeading({ level: 2 })
        .updateAttributes("heading", { numbered: null })
        .run(),
  },
  {
    id: "h3",
    label: "Título 3",
    hint: "Subsección",
    icon: Heading3,
    keywords: "encabezado subseccion",
    run: (editor) =>
      editor
        .chain()
        .focus()
        .setHeading({ level: 3 })
        .updateAttributes("heading", { numbered: null })
        .run(),
  },
  {
    id: "bullets",
    label: "Lista con viñetas",
    hint: "• elemento",
    icon: List,
    keywords: "lista puntos vinetas",
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: "numbers",
    label: "Lista numerada",
    hint: "1. elemento",
    icon: ListOrdered,
    keywords: "lista numeros",
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "quote",
    label: "Cita",
    hint: "Texto destacado con sangría",
    icon: Quote,
    keywords: "cita nota destacado",
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "table",
    label: "Tabla",
    hint: "3 × 3 con encabezado",
    icon: Table,
    keywords: "tabla cuadro",
    run: (editor) =>
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    id: "columns",
    label: "Dos columnas",
    hint: "Tabla sin bordes para alinear texto",
    icon: Columns2,
    keywords: "columnas sin bordes alinear",
    run: (editor) =>
      editor
        .chain()
        .focus()
        .insertTable({ rows: 1, cols: 2, withHeaderRow: false })
        .updateAttributes("table", { borderless: true })
        .run(),
  },
  {
    id: "rule",
    label: "Línea separadora",
    hint: "Línea horizontal",
    icon: Minus,
    keywords: "linea separador",
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    id: "page-break",
    label: "Salto de página",
    hint: "Lo siguiente empieza en una página nueva",
    icon: SeparatorHorizontal,
    keywords: "pagina nueva salto",
    run: (editor) => editor.chain().focus().setPageBreak().run(),
  },
];
