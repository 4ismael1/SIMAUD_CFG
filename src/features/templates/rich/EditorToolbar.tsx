import type { ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  SeparatorHorizontal,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Underline,
  Undo2,
} from 'lucide-react';
import { Menu, cn, type MenuItem } from '../../../ui';

type BlockStyle = 'paragraph' | 'h1' | 'h2' | 'h3';

const BLOCK_STYLES: { value: BlockStyle; label: string }[] = [
  { value: 'paragraph', label: 'Texto normal' },
  { value: 'h1', label: 'Título 1' },
  { value: 'h2', label: 'Título 2' },
  { value: 'h3', label: 'Título 3' },
];

interface ToolButtonProps {
  label: string;
  shortcut?: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** Keeps the editor selection: mousedown is cancelled so focus never leaves the text. */
function ToolButton({ label, shortcut, icon, active = false, disabled = false, onClick }: ToolButtonProps) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-grid size-8 shrink-0 place-items-center rounded-md text-slate-600 transition-colors [&_svg]:size-4',
        'hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40',
        active && 'bg-vino-50 text-vino-700 hover:bg-vino-100 hover:text-vino-800',
      )}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" aria-hidden="true" />;
}

interface EditorToolbarProps {
  editor: Editor;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onInsertVariable: () => void;
}

export function EditorToolbar({ editor, fullscreen, onToggleFullscreen, onInsertVariable }: EditorToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      block: (current.isActive('heading', { level: 1 })
        ? 'h1'
        : current.isActive('heading', { level: 2 })
          ? 'h2'
          : current.isActive('heading', { level: 3 })
            ? 'h3'
            : 'paragraph') as BlockStyle,
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      superscript: current.isActive('superscript'),
      subscript: current.isActive('subscript'),
      highlight: current.isActive('highlight'),
      align: (['center', 'right', 'justify'].find((align) => current.isActive({ textAlign: align })) ?? 'left') as string,
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      blockquote: current.isActive('blockquote'),
      inTable: current.isActive('table'),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
      canMerge: current.can().mergeCells(),
      canSplit: current.can().splitCell(),
    }),
  });

  const chain = () => editor.chain().focus();
  /**
   * Menu items take focus away from the text. The editor's real focus event arrives a moment after
   * `focus()`, and on arrival it re-reads the browser's (old) cursor position; so wait for it, then
   * run the command, or a new table would be inserted but the cursor would jump back.
   */
  const later = (command: () => void) => () => {
    if (editor.isFocused) {
      command();
      return;
    }
    editor.once('focus', () => window.setTimeout(command, 0));
    editor.commands.focus();
  };

  function setBlockStyle(style: BlockStyle) {
    if (style === 'paragraph') chain().setParagraph().run();
    else chain().setHeading({ level: Number(style.slice(1)) as 1 | 2 | 3 }).run();
  }

  const tableItems: MenuItem[] = state.inTable
    ? [
        { label: 'Insertar fila arriba', onSelect: later(() => chain().addRowBefore().run()) },
        { label: 'Insertar fila abajo', onSelect: later(() => chain().addRowAfter().run()) },
        { label: 'Insertar columna a la izquierda', onSelect: later(() => chain().addColumnBefore().run()) },
        { label: 'Insertar columna a la derecha', onSelect: later(() => chain().addColumnAfter().run()) },
        { label: 'Combinar celdas', disabled: !state.canMerge, onSelect: later(() => chain().mergeCells().run()), separatorBefore: true },
        { label: 'Dividir celda', disabled: !state.canSplit, onSelect: later(() => chain().splitCell().run()) },
        { label: 'Fila de encabezado sí/no', onSelect: later(() => chain().toggleHeaderRow().run()) },
        { label: 'Eliminar fila', danger: true, onSelect: later(() => chain().deleteRow().run()), separatorBefore: true },
        { label: 'Eliminar columna', danger: true, onSelect: later(() => chain().deleteColumn().run()) },
        { label: 'Eliminar tabla', danger: true, onSelect: later(() => chain().deleteTable().run()) },
      ]
    : [
        { label: 'Tabla de 2 × 2', onSelect: later(() => chain().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run()) },
        { label: 'Tabla de 3 × 3 con encabezado', onSelect: later(() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()) },
        { label: 'Tabla de 4 × 4 con encabezado', onSelect: later(() => chain().insertTable({ rows: 4, cols: 4, withHeaderRow: true }).run()) },
      ];

  return (
    <div
      role="toolbar"
      aria-label="Formato del texto"
      className="flex items-center gap-0.5 overflow-x-auto border-b border-slate-200 bg-white px-2 py-1.5 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible"
    >
      <ToolButton label="Deshacer" shortcut="Ctrl+Z" icon={<Undo2 />} disabled={!state.canUndo} onClick={() => chain().undo().run()} />
      <ToolButton label="Rehacer" shortcut="Ctrl+Y" icon={<Redo2 />} disabled={!state.canRedo} onClick={() => chain().redo().run()} />
      <Divider />
      <label className="shrink-0">
        <span className="sr-only">Estilo del párrafo</span>
        <select
          value={state.block}
          onChange={(event) => setBlockStyle(event.target.value as BlockStyle)}
          className="h-8 rounded-md border border-slate-200 bg-white pr-7 pl-2 text-[13px] text-slate-700 hover:border-slate-300 focus:outline-2 focus:outline-vino-600"
        >
          {BLOCK_STYLES.map((style) => (
            <option key={style.value} value={style.value}>{style.label}</option>
          ))}
        </select>
      </label>
      <Divider />
      <ToolButton label="Negrita" shortcut="Ctrl+B" icon={<Bold />} active={state.bold} onClick={() => chain().toggleBold().run()} />
      <ToolButton label="Cursiva" shortcut="Ctrl+I" icon={<Italic />} active={state.italic} onClick={() => chain().toggleItalic().run()} />
      <ToolButton label="Subrayado" shortcut="Ctrl+U" icon={<Underline />} active={state.underline} onClick={() => chain().toggleUnderline().run()} />
      <ToolButton label="Tachado" icon={<Strikethrough />} active={state.strike} onClick={() => chain().toggleStrike().run()} />
      <ToolButton label="Resaltar" icon={<Highlighter />} active={state.highlight} onClick={() => chain().toggleHighlight().run()} />
      <ToolButton label="Superíndice" icon={<Superscript />} active={state.superscript} onClick={() => chain().toggleSuperscript().run()} />
      <ToolButton label="Subíndice" icon={<Subscript />} active={state.subscript} onClick={() => chain().toggleSubscript().run()} />
      <Divider />
      <ToolButton label="Alinear a la izquierda" icon={<AlignLeft />} active={state.align === 'left'} onClick={() => chain().setTextAlign('left').run()} />
      <ToolButton label="Centrar" icon={<AlignCenter />} active={state.align === 'center'} onClick={() => chain().setTextAlign('center').run()} />
      <ToolButton label="Alinear a la derecha" icon={<AlignRight />} active={state.align === 'right'} onClick={() => chain().setTextAlign('right').run()} />
      <ToolButton label="Justificar" icon={<AlignJustify />} active={state.align === 'justify'} onClick={() => chain().setTextAlign('justify').run()} />
      <Divider />
      <ToolButton label="Lista con viñetas" icon={<List />} active={state.bulletList} onClick={() => chain().toggleBulletList().run()} />
      <ToolButton label="Lista numerada" icon={<ListOrdered />} active={state.orderedList} onClick={() => chain().toggleOrderedList().run()} />
      <ToolButton label="Cita" icon={<Quote />} active={state.blockquote} onClick={() => chain().toggleBlockquote().run()} />
      <Divider />
      <Menu
        items={tableItems}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-label={state.inTable ? 'Opciones de la tabla' : 'Insertar tabla'}
            title={state.inTable ? 'Opciones de la tabla' : 'Insertar tabla'}
            onMouseDown={(event) => event.preventDefault()}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] text-slate-600 hover:bg-slate-100 hover:text-slate-900 [&_svg]:size-4',
              state.inTable && 'bg-vino-50 text-vino-700',
            )}
          >
            <Table />
            <span className="hidden md:inline">Tabla</span>
          </button>
        )}
      />
      <ToolButton label="Línea separadora" icon={<Minus />} onClick={() => chain().setHorizontalRule().run()} />
      <ToolButton label="Salto de página (PDF)" icon={<SeparatorHorizontal />} onClick={() => chain().setPageBreak().run()} />
      <ToolButton label="Quitar formato" icon={<RemoveFormatting />} onClick={() => chain().unsetAllMarks().clearNodes().run()} />
      <Divider />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onInsertVariable}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-vino-700 hover:bg-vino-50 [&_svg]:size-4"
        title="Insertar un dato del contrato (o teclea «{{»)"
      >
        <Braces />
        Insertar dato
      </button>
      <span className="ml-auto" />
      <ToolButton
        label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        shortcut="Esc"
        icon={fullscreen ? <Minimize2 /> : <Maximize2 />}
        active={fullscreen}
        onClick={onToggleFullscreen}
      />
    </div>
  );
}
