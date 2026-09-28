import { describe, expect, it } from 'vitest';
import { bookBetNetCents, bookCapCents, defaultBookPayoutCents } from '../src/book.js';
import { decideNextBookholder, type BookholderCandidate } from '../src/bookholder.js';
import { sharePrice, sharesForBuyIn } from '../src/shares.js';
import { unitsForPick } from '../src/units.js';

/**
 * SPEC.md §9.1 — the full reference week, worked end to end with the
 * exported /shared functions, the way `closeWeek` will combine them in
 * Milestone 3.
 */
describe('§9.1 reference week, end to end', () => {
  const picks = [
    { playerId: 'P1', odds: -138, result: 'win' as const },
    { playerId: 'P2', odds: -112, result: 'win' as const },
    { playerId: 'P3', odds: 170, result: 'loss' as const },
    { playerId: 'P4', odds: -115, result: 'loss' as const },
    { playerId: 'P5', odds: -112, result: 'loss' as const },
    { playerId: 'P6', odds: -174, result: 'win' as const },
    { playerId: 'P7', odds: -110, result: 'loss' as const },
    { playerId: 'P8', odds: 180, result: 'loss' as const },
  ];

  const buyInCents = 1000; // $10 per player
  const sharePriceAtOpen = 1.0;
  const openingVaultCents = picks.length * buyInCents; // 8 players × $10

  it('opening Vault is $80.00 and the Book cap is $20.00', () => {
    expect(openingVaultCents).toBe(8000);
    expect(bookCapCents(openingVaultCents, 0.25)).toBe(2000);
  });

  it('the default payout on the parlay would have been $3,630.80', () => {
    expect(defaultBookPayoutCents(2000, 18054)).toBe(363080);
  });

  it('the losing parlay nets -$20.00, closing the Vault at $60.00 and share price at $0.75', () => {
    const bookNetCents = bookBetNetCents({ stakeCents: 2000, ticketOdds: 18054, result: 'loss' });
    expect(bookNetCents).toBe(-2000);

    const closingVaultCents = openingVaultCents + bookNetCents;
    expect(closingVaultCents).toBe(6000);

    const totalShares = picks.reduce(
      (sum, p) => sum + sharesForBuyIn(buyInCents, sharePriceAtOpen),
      0,
    );
    expect(totalShares).toBe(80);

    expect(sharePrice(closingVaultCents, totalShares)).toBe(0.75);
  });

  it('the week record is 3-5-0', () => {
    const wins = picks.filter((p) => p.result === 'win').length;
    const losses = picks.filter((p) => p.result === 'loss').length;
    const pushes = picks.filter((p) => (p.result as string) === 'push').length;
    expect([wins, losses, pushes]).toEqual([3, 5, 0]);
  });

  it('units match the fixture table', () => {
    const units = Object.fromEntries(
      picks.map((p) => [p.playerId, unitsForPick(p.odds, p.result)]),
    );
    expect(units['P1']).toBeCloseTo(0.72, 2);
    expect(units['P2']).toBeCloseTo(0.89, 2);
    expect(units['P3']).toBe(-1);
    expect(units['P4']).toBe(-1);
    expect(units['P5']).toBe(-1);
    expect(units['P6']).toBeCloseTo(0.57, 2);
    expect(units['P7']).toBe(-1);
    expect(units['P8']).toBe(-1);
  });

  it('the next Bookholder is P2', () => {
    const candidates: BookholderCandidate[] = picks.map((p) => ({
      playerId: p.playerId,
      odds: p.odds,
      result: p.result,
      seasonUnits: unitsForPick(p.odds, p.result),
      weeksBoughtIn: 1,
    }));

    const decision = decideNextBookholder({ currentBookholderId: 'P2', candidates });
    expect(decision.nextBookholderId).toBe('P2');
  });

  it('a $10 buy-in the following week issues 13.333333 shares at $0.75', () => {
    expect(sharesForBuyIn(1000, 0.75)).toBe(13.333333);
  });
});
