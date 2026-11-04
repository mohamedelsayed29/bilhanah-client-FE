import { describe, expect, it } from 'vitest';
import { egpToPiastres, normalizeDigits, piastresToInput } from './format';

describe('price conversion', () => {
  it('turns EGP text into integer piastres without floating-point drift', () => {
    expect(egpToPiastres('45')).toBe(4500);
    expect(egpToPiastres('45.5')).toBe(4550);
    expect(egpToPiastres('0.29')).toBe(29);
    expect(egpToPiastres('19.99')).toBe(1999);
    expect(egpToPiastres(' ١٢٫٥ ')).toBe(1250);
    expect(egpToPiastres('12,75')).toBe(1275);
  });

  it('rejects text that is not an amount', () => {
    for (const value of ['', 'abc', '1.234', '-5', '1e3']) expect(egpToPiastres(value)).toBeNull();
  });

  it('round-trips piastres to input text', () => {
    expect(piastresToInput(4500)).toBe('45');
    expect(piastresToInput(4550)).toBe('45.5');
    expect(piastresToInput(1999)).toBe('19.99');
    expect(piastresToInput(5)).toBe('0.05');
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });
});
