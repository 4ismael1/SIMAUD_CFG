import type { ReactNode } from 'react';
import { cn } from '../../ui';
import type { BlockNode, InlineNode, ListItemNode, RichDoc, RichMark, TableCellNode, TextAlign } from './types';

/**
 * Renders a `rich-v1` document with React elements only (never innerHTML).
 * Unknown nodes or marks are skipped: the API validates the document, this is just a safety net.
 */

const ALIGN_CLASS: Record<TextAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify',
};

function alignClass(align: TextAlign | null | undefined): string | undefined {
  return align ? ALIGN_CLASS[align] : undefined;
}

function applyMarks(content: ReactNode, marks: RichMark[] | undefined): ReactNode {
  return (marks ?? []).reduce<ReactNode>((inner, mark) => {
    switch (mark.type) {
      case 'bold':
        return <strong>{inner}</strong>;
      case 'italic':
        return <em>{inner}</em>;
      case 'underline':
        return <u>{inner}</u>;
      case 'strike':
        return <s>{inner}</s>;
      case 'superscript':
        return <sup>{inner}</sup>;
      case 'subscript':
        return <sub>{inner}</sub>;
      case 'highlight':
        return <mark className="rounded-[2px] bg-amber-100 px-0.5 text-inherit">{inner}</mark>;
      default:
        return inner;
    }
  }, content);
}

interface RenderOptions {
  /** Labels for variables still unresolved (template preview, drafts). */
  variableLabels?: ReadonlyMap<string, string>;
}

function Inline({ nodes, options }: { nodes: InlineNode[] | undefined; options: RenderOptions }) {
  return (
    <>
      {(nodes ?? []).map((node, index) => {
        if (node.type === 'text') return <span key={index}>{applyMarks(node.text, node.marks)}</span>;
        if (node.type === 'hardBreak') return <br key={index} />;
        if (node.type === 'variable') {
          const label = options.variableLabels?.get(node.attrs.name) ?? node.attrs.name;
          return (
            <span key={index} className="rounded bg-vino-50 px-1 font-sans text-[0.85em] text-vino-700 ring-1 ring-vino-200/70 ring-inset">
              {applyMarks(`[${label}]`, node.marks)}
            </span>
          );
        }
        return null;
      })}
    </>
  );
}

function ListItems({ items, options }: { items: ListItemNode[]; options: RenderOptions }) {
  return (
    <>
      {items.map((item, index) => (
        <li key={index} className="pl-1">
          <Blocks blocks={item.content} options={options} compact />
        </li>
      ))}
    </>
  );
}

function Cell({ cell, options }: { cell: TableCellNode; options: RenderOptions }) {
  const Tag = cell.type === 'tableHeader' ? 'th' : 'td';
  return (
    <Tag
      colSpan={cell.attrs?.colspan ?? undefined}
      rowSpan={cell.attrs?.rowspan ?? undefined}
      className={cn('border border-slate-300 px-2.5 py-1.5 align-top', cell.type === 'tableHeader' && 'bg-slate-50 text-left font-semibold')}
    >
      <Blocks blocks={cell.content} options={options} compact />
    </Tag>
  );
}

function Block({ block, options }: { block: BlockNode; options: RenderOptions }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p className={cn('min-h-[1em]', alignClass(block.attrs?.textAlign))}>
          <Inline nodes={block.content} options={options} />
        </p>
      );
    case 'heading': {
      const level = block.attrs.level;
      const className = cn(
        'font-serif font-bold text-slate-900',
        level === 1 && 'mt-2 text-[1.35em] leading-snug',
        level === 2 && 'mt-1.5 text-[1.15em] leading-snug',
        level === 3 && 'text-[1em] tracking-[0.02em] uppercase',
        alignClass(block.attrs.textAlign),
      );
      const content = <Inline nodes={block.content} options={options} />;
      if (level === 1) return <h3 className={className}>{content}</h3>;
      if (level === 2) return <h4 className={className}>{content}</h4>;
      return <h5 className={className}>{content}</h5>;
    }
    case 'bulletList':
      return (
        <ul className="ml-6 flex list-disc flex-col gap-1.5 marker:text-slate-400">
          <ListItems items={block.content} options={options} />
        </ul>
      );
    case 'orderedList':
      return (
        <ol start={block.attrs?.start ?? undefined} className="ml-6 flex list-decimal flex-col gap-1.5 marker:text-slate-500">
          <ListItems items={block.content} options={options} />
        </ol>
      );
    case 'blockquote':
      return (
        <blockquote className="border-l-[3px] border-slate-300 pl-4 text-slate-700 italic">
          <Blocks blocks={block.content} options={options} compact />
        </blockquote>
      );
    case 'horizontalRule':
      return <hr className="my-2 border-slate-300" />;
    case 'pageBreak':
      return (
        <div role="separator" aria-label="Salto de página" className="relative my-3 border-t border-dashed border-slate-300 print:break-after-page print:border-0">
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-paper px-2 font-sans text-[10px] tracking-wider text-slate-400 uppercase print:hidden">
            Salto de página
          </span>
        </div>
      );
    case 'table':
      return (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full border-collapse text-[0.93em]">
            <tbody>
              {block.content.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.content.map((cell, cellIndex) => (
                    <Cell key={cellIndex} cell={cell} options={options} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

function Blocks({ blocks, options, compact = false }: { blocks: BlockNode[]; options: RenderOptions; compact?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col', compact ? 'gap-1.5' : 'gap-3.5')}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} options={options} />
      ))}
    </div>
  );
}

export function RichDocumentBody({ doc, variableLabels }: { doc: RichDoc } & RenderOptions) {
  return <Blocks blocks={doc.content} options={{ variableLabels }} />;
}
