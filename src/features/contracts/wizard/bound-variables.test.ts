import { describe, expect, it } from 'vitest';
import { contractBoundValues, effectiveVariables, isContractBound, isPartyVariable, monthsBetween, partyValues } from './bound-variables';
import { emptyDraft, validateSignatoriesStep } from './wizard-state';

const person = (role: 'client' | 'contractor' | 'witness', name: string, cedula: string) => ({ role, name, cedula, email: `${name.split(' ')[0].toLowerCase()}@x.do`, phone: '' });

describe('datos que el contrato ya conoce', () => {
  it('calcula la duración en meses completos', () => {
    expect(monthsBetween('2026-11-10', '2026-12-10')).toBe(1);
    expect(monthsBetween('2026-11-10', '2027-11-10')).toBe(12);
    expect(monthsBetween('2026-11-10', '2026-12-09')).toBe(1);
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
});

describe('las personas salen de los firmantes', () => {
  const signatories = [person('contractor', 'Rosa Almonte Díaz', '00112345673'), person('client', 'Pedro Gómez Santana', '03145678904'), person('witness', 'Ana Testigo', '')];

  it('el cliente y el representante se rellenan con el primer firmante de cada rol', () => {
    expect(partyValues(signatories)).toEqual({
      representante_nombre: 'Rosa Almonte Díaz',
      representante_cedula: '001-1234567-3',
      representante_email: 'rosa@x.do',
      cliente_nombre: 'Pedro Gómez Santana',
      cliente_cedula: '031-4567890-4',
      cliente_email: 'pedro@x.do',
    });
  });

  it('lo enviado mezcla lo escrito, los firmantes y el contrato', () => {
    const values = effectiveVariables({ startDate: '2026-11-10', endDate: '2026-12-10', value: '87000', variables: { representante_cargo: 'Rectora', cliente_nombre: 'otro' }, signatories });
    expect(values).toMatchObject({ representante_cargo: 'Rectora', cliente_nombre: 'Pedro Gómez Santana', valor_contrato: '87000.00', duracion_meses: 1 });
  });

  it('avisa si el documento necesita un rol que no está entre los firmantes', () => {
    const draft = { ...emptyDraft(), signatories: [{ ...emptyDraft().signatories[0], role: 'client' as const, name: 'Pedro', cedula: '03145678904', email: 'p@x.do' }] };
    const variables = [{ id: '1', name: 'representante_nombre', label: 'Representante', type: 'text' as const, required: true, createdAt: '', updatedAt: '' }];
    expect(validateSignatoriesStep(draft, variables).signatories).toContain('Por la institución');
  });

  it('distingue los datos ligados', () => {
    expect(isContractBound('fecha_inicio')).toBe(true);
    expect(isPartyVariable('cliente_cedula')).toBe(true);
    expect(isPartyVariable('representante_cargo')).toBe(false); // se pide en «Datos»
    expect(isPartyVariable('forma_pago')).toBe(false);
  });
});
