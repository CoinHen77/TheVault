import { describe, expect, it } from 'vitest';
import { paidInCents, projectedPayouts } from '../src/index.js';

describe('paidInCents', () => {
  it('sums buy-ins and preloads, net of unmarks, and ignores Book results', () => {
    expect(
      paidInCents([
        { type: 'buy_in', amountCents: 1000 },
        { type: 'buy_in', amountCents: 1000 },
        { type: 'buy_in', amountCents: -1000 },
        { type: 'preload', amountCents: 5000 },
        { type: 'book_net', amountCents: -2000 },
        { type: 'adjustment', amountCents: 300 },
      ]),
    ).toBe(6000);
  });
});

describe('projectedPayouts', () => {
  // §9.1 numbers: $60 Vault, 80 shares; P2 leads at 0.89u.
  const standings = [
    { playerId: 'P1', units: 0.72, shares: 10 },
    { playerId: 'P2', units: 0.89, shares: 10 },
    { playerId: 'P3', units: -1, shares: 60 },
  ];

  it('gives the leader 10% of the Vault on top of a share of the other 90%', () => {
    const p = projectedPayouts(standings, 6000, 80, 0.1);
    expect(p.P2).toEqual({ groupCents: 675, sharpCents: 600, totalCents: 1275 });
    expect(p.P1).toEqual({ groupCents: 675, sharpCents: 0, totalCents: 675 });
    expect(p.P3).toEqual({ groupCents: 4050, sharpCents: 0, totalCents: 4050 });
  });

  it('splits the Sharp award while the lead is tied', () => {
    const tied = standings.map((s) => (s.playerId === 'P1' ? { ...s, units: 0.89 } : s));
    const p = projectedPayouts(tied, 6000, 80, 0.1);
    expect(p.P1!.sharpCents).toBe(300);
    expect(p.P2!.sharpCents).toBe(300);
  });

  it('handles an empty season', () => {
    expect(projectedPayouts([], 0, 0, 0.1)).toEqual({});
    expect(projectedPayouts([{ playerId: 'A', units: 0, shares: 0 }], 0, 0, 0.1).A!.totalCents).toBe(0);
  });
});
