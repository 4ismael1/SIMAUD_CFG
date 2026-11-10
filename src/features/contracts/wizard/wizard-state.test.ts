import { describe, expect, it } from 'vitest';
import { emptyDraft, hasDraftContent } from './wizard-state';

describe('hasDraftContent (contrato a medias)', () => {
  it('un formulario vacío no es un borrador', () => {
    expect(hasDraftContent(emptyDraft())).toBe(false);
  });

  it('elegir solo una plantilla no es un borrador', () => {
    expect(hasDraftContent({ ...emptyDraft(), templateId: 'abc' })).toBe(false);
  });

  it('escribir un dato, el título o un firmante sí lo es', () => {
    expect(hasDraftContent({ ...emptyDraft(), title: 'Servicios' })).toBe(true);
    expect(hasDraftContent({ ...emptyDraft(), variables: { cliente_nombre: 'Ana' } })).toBe(true);
    const draft = emptyDraft();
    draft.signatories[0].cedula = '402';
    expect(hasDraftContent(draft)).toBe(true);
  });

  it('espacios en blanco no cuentan', () => {
    expect(hasDraftContent({ ...emptyDraft(), title: '   ', notes: ' ' })).toBe(false);
  });
});
