import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { Columns2, Columns3, Plus, RectangleHorizontal, Trash2, X } from 'lucide-react';
import { cn } from '../../../ui';

/**
 * «Firmas» block (rich-v2). In the editor it is ONE atomic node whose boxes live in `attrs.slots`
 * (simple to edit with inputs); `sanitizeRichDoc` turns it into the stored shape with `signatureSlot`
 * children, and `toEditorJson` turns it back. Box n is signed by the signer with signing order n.
 */

export interface EditorSignatureSlot {
  label: string;
  showName?: boolean;
  showId?: boolean;
}

export const MAX_SIGNATURE_SLOTS = 12;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    signatures: {
      /** Insert a signature block (two boxes in two columns by default). */
      insertSignatures: (slots?: EditorSignatureSlot[], columns?: 1 | 2 | 3) => ReturnType;
    };
  }
}

export const SignaturesNode = Node.create({
  name: 'signatures',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      columns: { default: 2 },
      slots: { default: [{ label: 'EL CLIENTE' }, { label: 'EL CONTRATISTA' }] as EditorSignatureSlot[] },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-signatures]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-signatures': '' }, { 'data-columns': HTMLAttributes.columns })];
  },

  renderText({ node }) {
    return (node.attrs.slots as EditorSignatureSlot[]).map((slot) => `____________ ${slot.label}`).join('\n');
  },

  addNodeView() {
    return ReactNodeViewRenderer(SignaturesView);
  },

  addCommands() {
    return {
      insertSignatures:
        (slots, columns = 2) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { columns, ...(slots ? { slots } : {}) } }),
    };
  },
});

const COLUMN_OPTIONS = [
  { value: 1, label: 'Una columna', icon: RectangleHorizontal },
  { value: 2, label: 'Dos columnas', icon: Columns2 },
  { value: 3, label: 'Tres columnas', icon: Columns3 },
] as const;

function SignaturesView({ node, updateAttributes, deleteNode, selected, editor, getPos }: ReactNodeViewProps) {
  const slots = node.attrs.slots as EditorSignatureSlot[];
  const columns = node.attrs.columns as 1 | 2 | 3;
  const editable = editor.isEditable;

  // Box numbers count the boxes of earlier signature blocks, so «Firmante n» matches the signing order.
  const here = typeof getPos === 'function' ? (getPos() ?? 0) : 0;
  let offset = 0;
  editor.state.doc.descendants((child, position) => {
    if (child.type.name === 'signatures' && position < here) offset += (child.attrs.slots as EditorSignatureSlot[]).length;
    return position < here;
  });

  const setSlot = (index: number, change: Partial<EditorSignatureSlot>) =>
    updateAttributes({ slots: slots.map((slot, i) => (i === index ? { ...slot, ...change } : slot)) });

  return (
    <NodeViewWrapper
      className={cn('signatures-block group/sig relative my-4 rounded-md', selected && 'ring-2 ring-vino-500 ring-offset-4 ring-offset-paper')}
      data-signatures=""
    >
      {editable && (
        <div
          contentEditable={false}
          className="absolute -top-9 right-0 z-10 hidden items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 font-sans shadow-sm group-hover/sig:flex group-focus-within/sig:flex"
        >
          <span className="px-2 text-[11px] font-medium text-slate-500">Firmas</span>
          {COLUMN_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.label}
              aria-label={option.label}
              aria-pressed={columns === option.value}
              onClick={() => updateAttributes({ columns: option.value })}
              className={cn('grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 [&_svg]:size-4', columns === option.value && 'bg-vino-50 text-vino-700')}
            >
              <option.icon />
            </button>
          ))}
          <button
            type="button"
            title="Añadir firmante"
            disabled={slots.length >= MAX_SIGNATURE_SLOTS}
            onClick={() => updateAttributes({ slots: [...slots, { label: '' }] })}
            className="grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40 [&_svg]:size-4"
          >
            <Plus />
          </button>
          <button
            type="button"
            title="Quitar bloque de firmas"
            onClick={deleteNode}
            className="grid size-7 place-items-center rounded-md text-red-600 hover:bg-red-50 [&_svg]:size-4"
          >
            <Trash2 />
          </button>
        </div>
      )}
      <div className="sig-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {slots.map((slot, index) => (
          <div key={index} className="sig-slot group/slot relative">
            <div className="sig-space" />
            <div className="sig-line" />
            <div className="sig-meta" contentEditable={false}>
              {slot.showName !== false && <span className="sig-placeholder">[Firmante {offset + index + 1}]</span>}
              {slot.showId !== false && <span className="sig-placeholder">C.I. [cédula]</span>}
              {editable ? (
                <input
                  value={slot.label}
                  maxLength={60}
                  placeholder="Etiqueta (p. ej. EL CLIENTE)"
                  aria-label={`Etiqueta de la firma ${offset + index + 1}`}
                  onChange={(event) => setSlot(index, { label: event.target.value.toUpperCase() })}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="sig-label-input"
                />
              ) : (
                slot.label && <strong className="sig-label">{slot.label}</strong>
              )}
            </div>
            {editable && slots.length > 1 && (
              <button
                type="button"
                contentEditable={false}
                title="Quitar esta firma"
                aria-label={`Quitar la firma ${offset + index + 1}`}
                onClick={() => updateAttributes({ slots: slots.filter((_, i) => i !== index) })}
                className="absolute top-0 right-0 hidden size-6 place-items-center rounded-md text-slate-400 group-hover/slot:grid hover:bg-slate-100 hover:text-red-600 [&_svg]:size-3.5"
              >
                <X />
              </button>
            )}
          </div>
        ))}
      </div>
    </NodeViewWrapper>
  );
}

