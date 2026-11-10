import { describe, expect, it } from 'vitest';
import { contractBoundValues, effectiveVariables, isClientVariable, isContractBound, monthsBetween } from './bound-variables';

describe('datos que el contrato ya conoce', () => {
  it('calcula la duración en meses completos', () => {
    expect(monthsBetween('2026-11-10', '2026-12-10')).toBe(1);
    expect(monthsBetween('2026-11-10', '2027-11-10')).toBe(12);
    expect(monthsBetween('2026-11-10', '2026-12-09')).toBe(1); // menos de un mes cuenta como 1
    expect(monthsBetween('2026-12-10', '2026-11-10')).toBeNull();
    expect(monthsBetween('', '2026-11-10')).toBeNull();
  });

  it('toma fechas, valor y duración de los campos del contrato', () => {
    expect(contractBoundValues({ startDate: '2026-11-10', endDate: '2027-05-10', value: '67,000' })).toEqual({
      fecha_inicio: '2026-11-10',
      fecha_fin: '2027-05-10',
      valor_contrato: '67000.00',
      duracion_meses: 6,
    });
  });

  it('lo que se envía mezcla lo escrito y lo calculado, ganando lo calculado', () => {
    const values = effectiveVariables({
      startDate: '2026-11-10',
      endDate: '2026-12-10',
      value: '87000',
      variables: { cliente_nombre: 'Pedro', valor_contrato: '1', fecha_fin: '' },
    });
    expect(values).toMatchObject({ cliente_nombre: 'Pedro', valor_contrato: '87000.00', fecha_fin: '2026-12-10', duracion_meses: 1 });
  });

  it('distingue los datos ligados al contrato y los del cliente', () => {
    expect(isContractBound('fecha_inicio')).toBe(true);
    expect(isContractBound('cliente_nombre')).toBe(false);
    expect(isClientVariable('cliente_cedula')).toBe(true);
    expect(isClientVariable('forma_pago')).toBe(false);
  });
});
