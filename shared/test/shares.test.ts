import { describe, expect, it } from 'vitest';
import { round6, sharePrice, sharesForBuyIn } from '../src/shares.js';

describe('round6', () => {
  it('rounds to 6 decimal places', () => {
    expect(round6(13.333333333)).toBe(13.333333);
    expect(round6(1 / 3)).toBe(0.333333);
  });
});

describe('sharesForBuyIn', () => {
  it('issues 1:1 shares at $1.00 share price (§9.1 first week)', () => {
    expect(sharesForBuyIn(1000, 1.0)).toBe(10);
  });

  it('issues 13.333333 shares for a $10 buy-in at $0.75 (§9.1 second week)', () => {
    expect(sharesForBuyIn(1000, 0.75)).toBe(13.333333);
  });

  it('throws for a non-positive share price', () => {
    expect(() => sharesForBuyIn(1000, 0)).toThrow();
    expect(() => sharesForBuyIn(1000, -1)).toThrow();
  });
});

describe('sharePrice', () => {
  it('computes $0.75 from a $60 vault and 80 shares (§9.1)', () => {
    expect(sharePrice(6000, 80)).toBe(0.75);
  });

  it('starts at $1.00 conceptually when vault and shares are equal', () => {
    expect(sharePrice(8000, 80)).toBe(1.0);
  });

  it('throws for non-positive total shares', () => {
    expect(() => sharePrice(6000, 0)).toThrow();
  });
});
