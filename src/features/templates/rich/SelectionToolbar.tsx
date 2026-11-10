import { useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Highlighter, Italic, RemoveFormatting, Strikethrough, Underline } from 'lucide-react';
import { cn } from '../../../ui';

/**
 * Small floating bar over selected text (like Google Docs): the most used marks without going to the
 * toolbar. Hidden for empty selections, signature blocks and table-cell selections.
 */
export function SelectionToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      highlight: current.isActive('highlight'),
    }),
  });

  const buttons = [
    { label: 'Negrita', icon: Bold, active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Cursiva', icon: Italic, active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Subrayado', icon: Underline, active: state.underline, run: () => editor.chain().focus().toggleUnderline().run() },
    { label: 'Tachado', icon: Strikethrough, active: state.strike, run: () => editor.chain().focus().toggleStrike().run() },
    { label: 'Resaltar', icon: Highlighter, active: state.highlight, run: () => editor.chain().focus().toggleHighlight().run() },
    { label: 'Quitar formato', icon: RemoveFormatting, active: false, run: () => editor.chain().focus().unsetAllMarks().run() },
  ];

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: current, from, to }) =>
        from !== to && current.isEditable && !current.isActive('signatures') && !('$anchorCell' in current.state.selection)
      }
      className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 font-sans shadow-pop"
    >
      {buttons.map((button) => (
        <button
          key={button.label}
          type="button"
          title={button.label}
          aria-label={button.label}
          aria-pressed={button.active}
          onMouseDown={(event) => event.preventDefault()}
          onClick={button.run}
          className={cn(
            'grid size-8 place-items-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 [&_svg]:size-4',
            button.active && 'bg-vino-50 text-vino-700',
          )}
        >
          <button.icon />
        </button>
      ))}
    </BubbleMenu>
  );
}
