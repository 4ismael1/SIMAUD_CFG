import { useMemo } from 'react';
import { cn } from '../../../ui';
import { RichDocumentBody } from '../../../lib/rich-doc/RichDocumentBody';
import { Sheet } from '../../../lib/rich-doc/Sheet';
import { isRichDoc, type DocumentContent } from '../../../lib/rich-doc/types';

/**
 * The API returns the rendered contract as HTML-escaped text. We decode it back to plain text and render it
 * as React text nodes, so nothing coming from the server is ever injected as HTML.
 */
function decodeEscapedText(escaped: string): string {
  const parsed = new DOMParser().parseFromString(`<!doctype html><body>${escaped}`, 'text/html');
  return parsed.body.textContent ?? '';
}

/** "**PRIMERO.** texto" → bold lead-in, the usual way clauses are written in the templates. */
function Paragraph({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, index) =>
        part.startsWith('**') && part.endsWith('**') ? <b key={index}>{part.slice(2, -2)}</b> : <span key={index}>{part}</span>,
      )}
    </p>
  );
}

interface DocumentViewProps {
  /** Escaped plain text (format `plain`) or a formatted document (format `rich-v1`). */
  content: DocumentContent;
  /** Labels for variables not yet filled in (template preview). */
  variableLabels?: ReadonlyMap<string, string>;
  heading?: string;
  subheading?: string;
  children?: React.ReactNode;
  className?: string;
}

export function DocumentView({ content, variableLabels, heading, subheading, children, className }: DocumentViewProps) {
  const paragraphs = useMemo(
    () =>
      isRichDoc(content)
        ? []
        : decodeEscapedText(content)
            .split(/\n\s*\n/)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean),
    [content],
  );

  // Formatted documents are drawn on their real sheet (paper, margins, font, header and footer).
  if (isRichDoc(content)) {
    return (
      <article className={cn('min-w-0 rounded-[4px] bg-slate-100 px-2 py-5 sm:px-5 sm:py-6', className)}>
        <Sheet attrs={content.attrs}>
          {(heading || subheading) && (
            <header className="mb-5 text-center font-sans">
              {heading && <h2 className="font-serif text-base font-bold tracking-[0.08em] uppercase">{heading}</h2>}
              {subheading && <p className="mt-1 font-mono text-xs text-slate-400">{subheading}</p>}
            </header>
          )}
          <RichDocumentBody doc={content} variableLabels={variableLabels} />
          {children}
        </Sheet>
      </article>
    );
  }

  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-3.5 rounded-[4px] border border-slate-200 bg-paper px-6 py-10 font-serif text-[15px] leading-[1.8] text-slate-800 shadow-doc sm:px-14 sm:py-14',
        className,
      )}
    >
      {heading && <h2 className="text-center font-serif text-base font-bold tracking-[0.08em] uppercase">{heading}</h2>}
      {subheading && <p className="-mt-2 text-center font-mono text-xs text-slate-400">{subheading}</p>}
      {isRichDoc(content) ? (
        <RichDocumentBody doc={content} variableLabels={variableLabels} />
      ) : (
        paragraphs.map((paragraph, index) => <Paragraph key={index} text={paragraph} />)
      )}
      {children}
    </article>
  );
}
