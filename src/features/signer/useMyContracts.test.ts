import { describe, expect, it } from 'vitest';
import type { SignatureInboxItem } from '../../lib/api/contract-types';
import { groupOf } from './useMyContracts';

const row = (status: SignatureInboxItem['status'], myTurn = false) => ({ status, myTurn }) as SignatureInboxItem;

describe('mis contratos: dónde va cada uno', () => {
  it('lo que espera mi firma va primero', () => {
    expect(groupOf(row('pending_signatures', true))).toBe('turn');
  });
  it('firmado por mí pero falta otra parte: en proceso', () => {
    expect(groupOf(row('pending_signatures'))).toBe('waiting');
  });
  it('vigente o por vencer: vigentes', () => {
    expect(groupOf(row('active'))).toBe('active');
    expect(groupOf(row('expiring_soon'))).toBe('active');
  });
  it('vencido, cancelado o renovado: finalizados', () => {
    expect(groupOf(row('expired'))).toBe('finished');
    expect(groupOf(row('cancelled'))).toBe('finished');
    expect(groupOf(row('renewed'))).toBe('finished');
  });
});
