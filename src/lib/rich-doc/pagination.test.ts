import { describe, expect, it } from 'vitest';
import { planPages, type MeasuredBlock } from './pagination';

const block = (kind: MeasuredBlock['kind'], top: number, height: number): MeasuredBlock => ({ kind, top, height });
// Writable area 1000 px per page; next page's writable area starts 1200 px below (margins + gap).
const geometry = { usable: 1000, stride: 1200 };

describe('planPages', () => {
  it('un bloque de firmas que no cabe pasa entero a la página siguiente', () => {
    const plan = planPages([block('other', 0, 900), block('signatures', 900, 200)], geometry);
    expect(plan.spacers.get(1)).toBe(300);
    expect(plan.pages).toBe(2);
  });

  it('un bloque que cabe se queda donde está', () => {
    const plan = planPages([block('other', 0, 500), block('signatures', 500, 200)], geometry);
    expect(plan.spacers.size).toBe(0);
    expect(plan.pages).toBe(1);
  });

  it('un párrafo que no cabe en lo que queda también pasa entero', () => {
    const plan = planPages([block('other', 0, 900), block('other', 900, 300)], geometry);
    expect(plan.spacers.get(1)).toBe(300);
    expect(plan.pages).toBe(2);
  });

  it('un título no queda solo al pie: baja con su párrafo', () => {
    const plan = planPages([block('other', 0, 960), block('heading', 960, 30), block('other', 990, 200)], geometry);
    expect(plan.spacers.get(1)).toBe(240);
  });

  it('tras un salto de página lo siguiente empieza en página nueva', () => {
    const plan = planPages([block('other', 0, 300), block('pageBreak', 300, 20), block('other', 320, 100)], geometry);
    expect(plan.spacers.get(2)).toBe(880);
    expect(plan.pages).toBe(2);
  });

  it('un bloque más alto que una página no se mueve y ocupa varias páginas', () => {
    const plan = planPages([block('other', 0, 500), block('other', 500, 1500)], geometry);
    expect(plan.spacers.size).toBe(0);
    expect(plan.pages).toBe(2);
  });

  it('acumula el espacio insertado para los bloques siguientes', () => {
    const plan = planPages(
      [block('other', 0, 900), block('other', 900, 200), block('other', 1100, 700), block('signatures', 1800, 200)],
      geometry,
    );
    expect(plan.spacers.get(1)).toBe(300);
    // Block 2 (1400–2100) + signatures (2100–2300) cross the end of page 2 (2200): both move to page 3 (2400).
    expect(plan.spacers.get(2)).toBe(1000);
    expect(plan.spacers.has(3)).toBe(false);
    expect(plan.pages).toBe(3);
  });

  it("el párrafo de cierre baja junto con las firmas", () => {
    // Closing line 860–900, signatures 900–1100: together they do not fit (page ends at 1000) → both move.
    const plan = planPages([block("other", 0, 860), block("other", 860, 40), block("signatures", 900, 200)], geometry);
    expect(plan.spacers.get(1)).toBe(340);
    expect(plan.spacers.has(2)).toBe(false);
    expect(plan.pages).toBe(2);
  });

  it("el plan es estable: medir con los espacios ya aplicados da el mismo resultado", () => {
    const blocks = [block("other", 0, 860), block("other", 860, 40), block("signatures", 900, 200)];
    const first = planPages(blocks, geometry);
    const again = planPages(blocks, geometry);
    expect([...again.spacers]).toEqual([...first.spacers]);
  });
});
