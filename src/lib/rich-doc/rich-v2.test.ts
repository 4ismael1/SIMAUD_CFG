import { describe, expect, it } from 'vitest';
import { clauseNumber, richDocToPlain, richDocToV1, toEditorJson } from './convert';
import { sameDocument, sanitizeRichDoc } from './sanitize';
import { compactPage, resolvePage } from './page';
import type { RichDoc } from './types';

const doc: RichDoc = {
  type: 'doc',
  attrs: { page: { size: 'legal', margins: { top: 20, right: 25, bottom: 20, left: 25 } } },
  content: [
    { type: 'heading', attrs: { level: 2, numbered: 'ordinal' }, content: [{ type: 'text', text: 'OBJETO' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Texto' }] },
    { type: 'heading', attrs: { level: 2, numbered: 'ordinal' }, content: [{ type: 'text', text: 'PLAZO' }] },
    {
      type: 'signatures',
      attrs: { columns: 2 },
      content: [
        { type: 'signatureSlot', attrs: { label: 'EL CLIENTE' } },
        { type: 'signatureSlot', attrs: { label: 'EL CONTRATISTA', showId: false } },
        { type: 'signatureSlot', attrs: { label: 'TESTIGO' } },
      ],
    },
  ],
};

describe('rich-v2: firmas en el editor', () => {
  it('el editor carga las casillas como atributos y al guardar vuelven a ser hijos', () => {
    const editorJson = toEditorJson(doc) as { content: { type: string; attrs?: { slots?: unknown[] } }[] };
    const block = editorJson.content.find((node) => node.type === 'signatures');
    expect(block?.attrs?.slots).toHaveLength(3);
    const saved = sanitizeRichDoc(editorJson);
    expect(saved.content[3]).toEqual({
      type: 'signatures',
      content: [
        { type: 'signatureSlot', attrs: { label: 'EL CLIENTE' } },
        { type: 'signatureSlot', attrs: { label: 'EL CONTRATISTA', showId: false } },
        { type: 'signatureSlot', attrs: { label: 'TESTIGO' } },
      ],
    });
  });

  it('conserva los ajustes de página que no son los de por defecto', () => {
    const saved = sanitizeRichDoc({ ...doc, attrs: { page: { size: 'legal', margins: { top: 20, right: 25, bottom: 20, left: 25 }, font: 'serif' } } });
    expect(saved.attrs).toEqual({ page: { size: 'legal', margins: { top: 20, right: 25, bottom: 20, left: 25 } } });
  });

  it('descarta márgenes fuera de rango y encabezados vacíos', () => {
    const saved = sanitizeRichDoc({ type: 'doc', attrs: { page: { margins: { top: 2, right: 25, bottom: 25, left: 25 } }, header: { left: { kind: 'text', text: '  ' } } }, content: [] });
    expect(saved.attrs).toBeUndefined();
  });
});

describe('rich-v2 → rich-v1', () => {
  it('numera las cláusulas como texto y convierte las firmas en tabla sin bordes', () => {
    const v1 = richDocToV1(doc);
    expect(v1.attrs).toBeUndefined();
    expect(v1.content[0]).toMatchObject({ type: 'heading', content: [{ text: 'PRIMERA. ' }, { text: 'OBJETO' }] });
    expect(v1.content[2]).toMatchObject({ content: [{ text: 'SEGUNDA. ' }, { text: 'PLAZO' }] });
    const table = v1.content[3];
    expect(table).toMatchObject({ type: 'table', attrs: { borderless: true } });
    if (table.type !== 'table') throw new Error('tabla');
    expect(table.content).toHaveLength(2);
    expect(table.content[1].content).toHaveLength(2);
  });

  it('el texto plano mantiene firmantes y etiquetas', () => {
    const plain = richDocToPlain(richDocToV1(doc));
    expect(plain).toContain('PRIMERA. OBJETO');
    expect(plain).toContain('[Firmante 3]');
    expect(plain).toContain('TESTIGO');
  });
});

describe('numeración y página', () => {
  it('ordinales en español y decimales', () => {
    expect(clauseNumber(1, 'ordinal')).toBe('PRIMERA.');
    expect(clauseNumber(12, 'ordinal')).toBe('DUODÉCIMA.');
    expect(clauseNumber(3, 'decimal')).toBe('3.');
  });

  it('la página por defecto es Carta con 25 mm y no se guarda', () => {
    expect(resolvePage(undefined).size).toBe('letter');
    expect(compactPage(resolvePage(undefined))).toBeUndefined();
  });
});

describe('sameDocument (cambios sin guardar)', () => {
  const stored = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hola', marks: [{ type: 'italic' }, { type: 'bold' }] }] },
      { type: 'table', attrs: { borderless: true }, content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] }] },
    ],
  };
  // What the editor emits right after opening it: defaults filled in, its own mark order, a trailing empty line.
  const fromEditor = {
    type: 'doc',
    attrs: { page: null, header: null, footer: null },
    content: [
      { type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text: 'Hola', marks: [{ type: 'bold' }, { type: 'italic' }] }] },
      {
        type: 'table',
        attrs: { borderless: true },
        content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', attrs: { textAlign: null } }] }] }],
      },
      { type: 'paragraph', attrs: { textAlign: null } },
    ],
  };

  it('abrir una plantilla sin tocarla no cuenta como cambio', () => {
    expect(sameDocument(stored, fromEditor)).toBe(true);
  });

  it('un cambio real sí cuenta', () => {
    const edited = structuredClone(fromEditor);
    (edited.content[0] as { content: { text: string }[] }).content[0].text = 'Hola!';
    expect(sameDocument(stored, edited)).toBe(false);
  });
});
