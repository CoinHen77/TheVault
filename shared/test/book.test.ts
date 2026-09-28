import { describe, expect, it } from 'vitest';
import { bookBetNetCents, bookCapCents, defaultBookPayoutCents } from '../src/book.js';

describe('bookCapCents', () => {
  it('is $20.00 (2000 cents) for an $80 opening Vault at 25% (§9.1)', () => {
    expect(bookCapCents(8000, 0.25)).toBe(2000);
  });

  it('floors to the nearest cent', () => {
    expect(bookCapCents(8001, 0.25)).toBe(2000); // 2000.25 → floor 2000
  });
});

describe('defaultBookPayoutCents', () => {
  it('is $3,630.80 for a $20 stake at +18054 (§9.1)', () => {
    expect(defaultBookPayoutCents(2000, 18054)).toBe(363080);
  });
});

describe('bookBetNetCents', () => {
  it('§9.1: an 8-leg parlay, $20 stake, that loses nets -$20.00', () => {
    const net = bookBetNetCents({ stakeCents: 2000, ticketOdds: 18054, result: 'loss' });
    expect(net).toBe(-2000);
  });

  it('a win with the default payout nets payout minus stake', () => {
    const net = bookBetNetCents({ stakeCents: 2000, ticketOdds: 18054, result: 'win' });
    expect(net).toBe(363080 - 2000);
  });

  it('§9.1: a ticket-override payout of $3,630.82 is accepted and used', () => {
    const net = bookBetNetCents({
      stakeCents: 2000,
      ticketOdds: 18054,
      result: 'win',
      payoutCentsOverride: 363082,
    });
    expect(net).toBe(363082 - 2000);
  });

  it('a push/void nets zero', () => {
    const net = bookBetNetCents({ stakeCents: 2000, ticketOdds: 18054, result: 'push' });
    expect(net).toBe(0);
  });
});
