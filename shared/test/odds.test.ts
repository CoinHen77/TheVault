import { describe, expect, it } from 'vitest';
import { americanToDecimal, isValidAmericanOdds } from '../src/odds.js';

describe('isValidAmericanOdds', () => {
  it.each([-100, -138, -100000, 100, 170, 18054])('accepts %i', (odds) => {
    expect(isValidAmericanOdds(odds)).toBe(true);
  });

  it.each([-99, 0, 99, 1, -1])('rejects %i (between -100 and 100)', (odds) => {
    expect(isValidAmericanOdds(odds)).toBe(false);
  });

  it('rejects non-integers', () => {
    expect(isValidAmericanOdds(150.5)).toBe(false);
  });
});

describe('americanToDecimal', () => {
  it('converts negative odds', () => {
    expect(americanToDecimal(-138)).toBeCloseTo(1.7246, 4);
    expect(americanToDecimal(-112)).toBeCloseTo(1.8929, 4);
    expect(americanToDecimal(-174)).toBeCloseTo(1.5747, 4);
  });

  it('converts positive odds', () => {
    expect(americanToDecimal(170)).toBeCloseTo(2.7, 4);
    expect(americanToDecimal(100)).toBe(2);
  });

  it('converts the fixture book ticket odds', () => {
    // SPEC.md §9.1: +18054 → default payout on $20 stake is $3,630.80
    expect(americanToDecimal(18054)).toBeCloseTo(181.54, 4);
  });

  it('throws on invalid odds', () => {
    expect(() => americanToDecimal(50)).toThrow();
    expect(() => americanToDecimal(-50)).toThrow();
    expect(() => americanToDecimal(0)).toThrow();
  });
});
