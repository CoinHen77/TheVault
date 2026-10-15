import { describe, expect, it } from 'vitest';
import { buildWeeklyReport, type BookBet, type BuyIn, type Pick, type TimestampLike, type Week, type WeeklyReportInput } from '../src/index.js';

const ts = (ms: number): TimestampLike => ({
  seconds: Math.floor(ms / 1000),
  nanoseconds: 0,
  toDate: () => new Date(ms),
  toMillis: () => ms,
});

const DAY = 86_400_000;
const names = { A: 'Alice', B: 'Bob', C: 'Cara' };

function week(id: string, order: number, over: Partial<Week> = {}): Week & { id: string } {
  return {
    id,
    nflWeek: order + 3,
    type: 'regular',
    order,
    buyInCents: 1000,
    lockAt: ts(order * 7 * DAY),
    status: 'closed',
    bookholderId: 'A',
    submittedPlayerIds: [],
    sharePriceAtOpen: 1,
    openingVaultCents: 3000,
    bookCapCents: 750,
    bookNetCents: 0,
    closingVaultCents: 3000,
    closingSharePrice: 1,
    totalSharesAtClose: 30,
    nextBookholderId: 'A',
    bookDecision: { rule: 'win', candidates: ['A'], tiebreakUsed: 'none' },
    closedAt: ts(order * 7 * DAY + 3 * DAY),
    ...over,
  };
}

function pick(id: string, pickText: string, americanOdds: number, result: Pick['result'], units: number, over: Partial<Pick> = {}) {
  return {
    id,
    playerId: id,
    pickText,
    gameText: 'X @ Y',
    americanOdds,
    submittedAt: ts(0),
    updatedAt: ts(0),
    result,
    units,
    ...over,
  } satisfies Pick & { id: string };
}

function buyIn(id: string, sharesIssued: number): BuyIn & { id: string } {
  return { id, amountCents: 1000, paid: true, paidAt: ts(0), sharePrice: 1, sharesIssued, markedBy: 'A' };
}

/** Week 1: Bob wins big; week 2 (the report): Cara jumps, Bob wins again, the Book cashes. */
function input(): WeeklyReportInput {
  const w1 = week('W04', 1, { nextBookholderId: 'B' });
  const w2 = week('W05', 2, {
    bookholderId: 'B',
    nextBookholderId: 'C',
    sharePriceAtOpen: 1,
    openingVaultCents: 6000,
    bookNetCents: 1200,
    closingVaultCents: 7200,
    closingSharePrice: 1.2,
  });
  const w1Picks = [pick('A', 'Lions ML', -150, 'loss', -1), pick('B', 'Bears +3', 170, 'win', 1.7), pick('C', 'Over 44', -110, 'loss', -1)];
  const w2Picks = [
    pick('A', 'Jets +7', 250, 'loss', -1),
    pick('B', 'Chiefs -3', -110, 'win', 0.909091),
    pick('C', 'Kelce o6.5', 300, 'win', 3, { sealed: { pickText: 'Kelce o5.5', americanOdds: -110, point: null } }),
  ];
  const bet: BookBet & { id: string } = {
    id: 'bet1',
    legPickIds: ['B', 'C'],
    stakeCents: 500,
    ticketOdds: 240,
    payoutCents: 1700,
    result: 'win',
    netCents: 1200,
    placedBy: 'B',
    placedAt: ts(0),
  };
  return {
    week: w2,
    picks: w2Picks,
    bets: [bet],
    history: [
      { week: w2, picks: w2Picks, buyIns: [buyIn('A', 10), buyIn('B', 10), buyIn('C', 10)] },
      { week: w1, picks: w1Picks, buyIns: [buyIn('A', 10), buyIn('B', 10), buyIn('C', 10)] },
    ],
    preloads: [],
    names,
    nextWeek: week('W06', 3, { status: 'open', bookholderId: 'C' }),
  };
}

describe('buildWeeklyReport', () => {
  const report = buildWeeklyReport(input());

  it('summarizes the Vault, the record and the headline', () => {
    expect(report.vault).toEqual({
      openingCents: 6000,
      bookNetCents: 1200,
      closingCents: 7200,
      sharePriceBefore: 1,
      sharePriceAfter: 1.2,
      sharePricePct: 20,
    });
    expect(report.record).toEqual({ w: 2, l: 1, p: 0 });
    expect(report.headline).toBe('The Book cashed $12.00');
    expect(report.subhead).toBe('The Vault climbs to $72.00. The crew went 2-1-0.');
  });

  it('lists picks best first, with the seal, the key and Book legs marked', () => {
    expect(report.picks.map((p) => p.name)).toEqual(['Cara', 'Bob', 'Alice']);
    expect(report.picks[0]).toMatchObject({ sealedText: 'Kelce o5.5 -110', getsKey: true, inBook: true });
    expect(report.picks[2]).toMatchObject({ getsKey: false, inBook: false });
    expect(report.bets[0]!.legs.map((l) => l.pickText)).toEqual(['Chiefs -3', 'Kelce o6.5']);
    expect(report.stakedCents).toBe(500);
    expect(report.key.name).toBe('Cara');
    expect(report.next?.keyHolderName).toBe('Cara');
  });

  it('rebuilds standings as of the week, with rank moves and share value', () => {
    expect(report.standings.map((r) => [r.name, r.rank, r.prevRank, r.units])).toEqual([
      ['Bob', 1, 1, 2.609091],
      ['Cara', 2, 3, 2], // tied Alice at -1u after week 1; the name tiebreak had her 3rd
      ['Alice', 3, 2, -2],
    ]);
    expect(report.standings[0]).toMatchObject({ wins: 2, losses: 0, weeksBoughtIn: 2, shares: 20, valueCents: 2400 });
  });

  it('hands out only the awards that happened', () => {
    expect(report.awards.map((a) => [a.title, a.name, a.detail])).toEqual([
      ['Big hit', 'Cara', 'Kelce o6.5 at +300 for +3.00u'],
      ['Climber', 'Cara', 'Up 1 spot to #2 in the Sharp race'],
      ['Hot hand', 'Bob', '2 wins in a row'],
      ['Book MVP', 'Bob', '2-leg parlay at +240 cashed +$12.00'],
    ]);
    // With room for a fourth award, the longest-odds loss gets one.
    const quiet = buildWeeklyReport({ ...input(), bets: [] });
    expect(quiet.awards.at(-1)).toMatchObject({ title: 'Went down swinging', name: 'Alice', detail: 'Jets +7 at +250' });
  });

  it('handles a week with no bets, a losing Book and a climber', () => {
    const base = input();
    const lost = buildWeeklyReport({ ...base, bets: [], week: { ...base.week, bookNetCents: 0 } });
    expect(lost.headline).toBe('The Book sat this one out');

    // Cara loses big in week 1 instead, so her week-2 win is a climb from #3.
    const w1 = base.history[1]!;
    const climbing = buildWeeklyReport({
      ...base,
      week: { ...base.week, bookNetCents: -500, closingVaultCents: 5500 },
      history: [base.history[0]!, { ...w1, picks: w1.picks.map((p) => (p.id === 'C' ? { ...p, units: -1 } : p.id === 'A' ? { ...p, result: 'push', units: 0 } : p)) }],
    });
    expect(climbing.headline).toBe('The Book took a $5.00 hit');
    expect(climbing.subhead).toMatch(/^The Vault slips to \$55\.00/);
    expect(climbing.awards.find((a) => a.key === 'climber')).toMatchObject({ name: 'Cara', detail: 'Up 1 spot to #2 in the Sharp race' });
  });
});
