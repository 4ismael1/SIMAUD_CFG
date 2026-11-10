import type { CSSProperties, ReactNode } from "react";
import type {
  SignaturesNode,
  BlockNode,
  InlineNode,
  ListItemNode,
  RichDoc,
  RichMark,
  TableCellNode,
  TableNode,
  TextAlign,
} from "./types";

/**
 * Renders a `rich-v1` document with React elements only (never innerHTML).
 *
 * It emits the same plain tags the editor produces (p, h1–h3, ul, table…) inside `.rich-content`,
 * so both share ONE stylesheet (src/index.css): what the author sees while editing is exactly what
 * the preview, the contract page and the signing page show. Do not add styling here; change
 * `.rich-content` instead. Unknown nodes or marks are skipped (the API validates the document).
 */

function alignStyle(
  align: TextAlign | null | undefined,
): CSSProperties | undefined {
  return align && align !== "left" ? { textAlign: align } : undefined;
}

function applyMarks(
  content: ReactNode,
  marks: RichMark[] | undefined,
): ReactNode {
  return (marks ?? []).reduce<ReactNode>((inner, mark) => {
    switch (mark.type) {
      case "bold":
        return <strong>{inner}</strong>;
      case "italic":
        return <em>{inner}</em>;
      case "underline":
        return <u>{inner}</u>;
      case "strike":
        return <s>{inner}</s>;
      case "superscript":
        return <sup>{inner}</sup>;
      case "subscript":
        return <sub>{inner}</sub>;
      case "highlight":
        return <mark>{inner}</mark>;
      default:
        return inner;
    }
  }, content);
}

interface RenderOptions {
  /** First box number of each signature block (box n = signer with signing order n). */
  signatureStart?: ReadonlyMap<SignaturesNode, number>;
  /** Labels for variables still unresolved (template preview, drafts). */
  variableLabels?: ReadonlyMap<string, string>;
}

function Inline({
  nodes,
  options,
}: {
  nodes: InlineNode[] | undefined;
  options: RenderOptions;
}) {
  return (
    <>
      {(nodes ?? []).map((node, index) => {
        if (node.type === "text")
          return <span key={index}>{applyMarks(node.text, node.marks)}</span>;
        if (node.type === "hardBreak") return <br key={index} />;
        if (node.type === "variable") {
          const label = options.variableLabels?.get(node.attrs.name);
          return (
            <span
              key={index}
              data-variable={node.attrs.name}
              className={label ? undefined : "is-unknown"}
            >
              {applyMarks(`[${label ?? node.attrs.name}]`, node.marks)}
            </span>
          );
        }
        return null;
      })}
    </>
  );
}

function ListItems({
  items,
  options,
}: {
  items: ListItemNode[];
  options: RenderOptions;
}) {
  return (
    <>
      {items.map((item, index) => (
        <li key={index}>
          <Blocks blocks={item.content} options={options} />
        </li>
      ))}
    </>
  );
}

function Cell({
  cell,
  options,
}: {
  cell: TableCellNode;
  options: RenderOptions;
}) {
  const Tag = cell.type === "tableHeader" ? "th" : "td";
  return (
    <Tag
      colSpan={cell.attrs?.colspan ?? undefined}
      rowSpan={cell.attrs?.rowspan ?? undefined}
    >
      <Blocks blocks={cell.content} options={options} />
    </Tag>
  );
}

function Table({
  table,
  options,
}: {
  table: TableNode;
  options: RenderOptions;
}) {
  return (
    <div className="tableWrapper">
      <table data-borderless={table.attrs?.borderless ? "" : undefined}>
        <tbody>
          {table.content.map((row, rowIndex) => (
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
}

function Block({
  block,
  options,
}: {
  block: BlockNode;
  options: RenderOptions;
}) {
  switch (block.type) {
    case "paragraph":
      return (
        <p style={alignStyle(block.attrs?.textAlign)}>
          {/* An empty paragraph is a blank line, as in the editor (ProseMirror puts a <br> there too). */}
          {block.content?.length ? (
            <Inline nodes={block.content} options={options} />
          ) : (
            <br />
          )}
        </p>
      );
    case "heading": {
      const Tag =
        block.attrs.level === 1 ? "h1" : block.attrs.level === 2 ? "h2" : "h3";
      return (
        <Tag
          style={alignStyle(block.attrs.textAlign)}
          data-numbered={block.attrs.numbered ?? undefined}
        >
          <Inline nodes={block.content} options={options} />
        </Tag>
      );
    }
    case "bulletList":
      return (
        <ul>
          <ListItems items={block.content} options={options} />
        </ul>
      );
    case "orderedList":
      return (
        <ol start={block.attrs?.start ?? undefined}>
          <ListItems items={block.content} options={options} />
        </ol>
      );
    case "blockquote":
      return (
        <blockquote>
          <Blocks blocks={block.content} options={options} />
        </blockquote>
      );
    case "horizontalRule":
      return <hr />;
    case "pageBreak":
      return (
        <div data-page-break="" role="separator" aria-label="Salto de página" />
      );
    case "table":
      return <Table table={block} options={options} />;
    case "signatures":
      return <Signatures block={block} options={options} />;
    default:
      return null;
  }
}

function Blocks({
  blocks,
  options,
}: {
  blocks: BlockNode[];
  options: RenderOptions;
}) {
  return (
    <>
      {blocks.map((block, index) => (
        <Block key={index} block={block} options={options} />
      ))}
    </>
  );
}

/** Signature boxes; box n shows the signer with signing order n (placeholders until there are signers). */
function Signatures({
  block,
  options,
}: {
  block: SignaturesNode;
  options: RenderOptions;
}) {
  const columns = block.attrs?.columns ?? 2;
  return (
    <div data-signatures="" className="signatures-block">
      <div
        className="sig-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {block.content.map((slot, index) => {
          const number = (options.signatureStart?.get(block) ?? 1) + index;
          return (
            <div key={index} className="sig-slot">
              <div className="sig-space" />
              <div className="sig-line" />
              <div className="sig-meta">
                {slot.attrs.showName !== false && (
                  <span className="sig-placeholder">[Firmante {number}]</span>
                )}
                {slot.attrs.showId !== false && (
                  <span className="sig-placeholder">C.I. [cédula]</span>
                )}
                {slot.attrs.label && (
                  <strong className="sig-label">{slot.attrs.label}</strong>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RichDocumentBody({
  doc,
  variableLabels,
}: { doc: RichDoc } & Pick<RenderOptions, "variableLabels">) {
  // Boxes are numbered across the whole document, in reading order.
  const signatureStart = new Map<SignaturesNode, number>();
  let next = 1;
  for (const block of doc.content) {
    if (block.type !== "signatures") continue;
    signatureStart.set(block, next);
    next += block.content.length;
  }
  const options: RenderOptions = { variableLabels, signatureStart };
  return (
    <div className="rich-content">
      <Blocks blocks={doc.content} options={options} />
    </div>
  );
}
