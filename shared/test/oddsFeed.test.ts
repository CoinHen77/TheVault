import { describe, expect, it } from 'vitest';
import {
  ODDS_CREDITS_PER_PULL,
  ODDS_FREE_TIER_CREDITS,
  ODDS_MONTHLY_BUDGET,
  ODDS_WORST_CASE_MONTH_CREDITS,
  eligibleOddsGames,
  oddsGameText,
  oddsMonthKey,
  oddsPickText,
  oddsPullBlockReason,
  parseOddsApiResponse,
} from '../src/oddsFeed.js';

/** Shaped like The Odds API v4 /odds response (oddsFormat=american). Fake lines. */
function rawEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt1',
    sport_key: 'americanfootball_nfl',
    commence_time: '2026-10-11T17:00:00Z',
    home_team: 'Carolina Panthers',
    away_team: 'Chicago Bears',
    bookmakers: [
      {
        key: 'fanduel',
        markets: [{ key: 'h2h', outcomes: [{ name: 'Chicago Bears', price: -999 }] }],
      },
      {
        key: 'draftkings',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'Chicago Bears', price: -140 },
              { name: 'Carolina Panthers', price: 118 },
            ],
          },
          {
            key: 'spreads',
            outcomes: [
              { name: 'Chicago Bears', price: -110, point: -2.5 },
              { name: 'Carolina Panthers', price: -110, point: 2.5 },
            ],
          },
          {
            key: 'totals',
            outcomes: [
              { name: 'Over', price: -108, point: 47.5 },
              { name: 'Under', price: -112, point: 47.5 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('parseOddsApiResponse', () => {
  it('reads all six DraftKings lines and ignores other books', () => {
    const [game] = parseOddsApiResponse([rawEvent()]);
    expect(game).toEqual({
      eventId: 'evt1',
      homeTeam: 'Carolina Panthers',
      awayTeam: 'Chicago Bears',
      commenceMs: Date.parse('2026-10-11T17:00:00Z'),
      lines: {
        spreadAway: { odds: -110, point: -2.5 },
        spreadHome: { odds: -110, point: 2.5 },
        mlAway: { odds: -140, point: null },
        mlHome: { odds: 118, point: null },
        over: { odds: -108, point: 47.5 },
        under: { odds: -112, point: 47.5 },
      },
    });
  });

  it('keeps a game with no DraftKings book, with no lines', () => {
    const [game] = parseOddsApiResponse([rawEvent({ bookmakers: [] })]);
    expect(game?.lines).toEqual({});
  });

  it('drops invalid prices and missing points', () => {
    const event = rawEvent({
      bookmakers: [
        {
          key: 'draftkings',
          markets: [
            { key: 'h2h', outcomes: [{ name: 'Chicago Bears', price: 50 }, { name: 'Carolina Panthers', price: 120 }] },
            { key: 'totals', outcomes: [{ name: 'Over', price: -110 }] },
          ],
        },
      ],
    });
    const [game] = parseOddsApiResponse([event]);
    expect(game?.lines).toEqual({ mlHome: { odds: 120, point: null } });
  });

  it('skips malformed events and non-array input', () => {
    expect(parseOddsApiResponse({ message: 'quota' })).toEqual([]);
    expect(parseOddsApiResponse([null, { id: 'x' }, rawEvent({ commence_time: 'nope' })])).toEqual([]);
  });

  it('sorts by kickoff', () => {
    const games = parseOddsApiResponse([
      rawEvent({ id: 'late', commence_time: '2026-10-12T00:20:00Z' }),
      rawEvent({ id: 'early', commence_time: '2026-10-11T17:00:00Z' }),
    ]);
    expect(games.map((g) => g.eventId)).toEqual(['early', 'late']);
  });
});

describe('pick text', () => {
  const game = { homeTeam: 'Carolina Panthers', awayTeam: 'Chicago Bears' };

  it('labels the game away @ home', () => {
    expect(oddsGameText(game)).toBe('CHI @ CAR');
    expect(oddsGameText({ homeTeam: 'Somewhere Else', awayTeam: 'San Francisco 49ers' })).toBe('SF @ Somewhere Else');
  });

  it('formats each market', () => {
    expect(oddsPickText(game, 'spreadAway', { odds: -110, point: -2.5 })).toBe('Bears -2.5');
    expect(oddsPickText(game, 'spreadHome', { odds: -110, point: 2.5 })).toBe('Panthers +2.5');
    expect(oddsPickText(game, 'spreadHome', { odds: -110, point: 0 })).toBe('Panthers PK');
    expect(oddsPickText(game, 'mlAway', { odds: -140, point: null })).toBe('Bears ML');
    expect(oddsPickText(game, 'over', { odds: -108, point: 47.5 })).toBe('Over 47.5');
    expect(oddsPickText(game, 'under', { odds: -112, point: 47.5 })).toBe('Under 47.5');
  });

  it('keeps college team names whole', () => {
    const cfb = { homeTeam: 'Georgia Bulldogs', awayTeam: 'Alabama Crimson Tide' };
    expect(oddsGameText(cfb)).toBe('Alabama Crimson Tide @ Georgia Bulldogs');
    expect(oddsPickText(cfb, 'spreadAway', { odds: -110, point: -3.5 })).toBe('Alabama Crimson Tide -3.5');
    expect(oddsPickText(cfb, 'mlHome', { odds: 140, point: null })).toBe('Georgia Bulldogs ML');
  });
});

describe('oddsMonthKey', () => {
  it('uses the ET calendar month', () => {
    expect(oddsMonthKey(Date.parse('2026-10-15T12:00:00Z'))).toBe('2026-10');
    // 11:30 PM ET on Oct 31 is already Nov 1 in UTC.
    expect(oddsMonthKey(Date.parse('2026-11-01T03:30:00Z'))).toBe('2026-10');
    expect(oddsMonthKey(Date.parse('2026-11-01T05:00:00Z'))).toBe('2026-11');
  });
});

describe('oddsPullBlockReason', () => {
  const ok = { paused: false, monthCreditsUsed: 0, apiRemaining: null };

  it('allows a normal pull', () => {
    expect(oddsPullBlockReason(ok)).toBeNull();
    expect(oddsPullBlockReason({ ...ok, apiRemaining: 400 })).toBeNull();
  });

  it('blocks when paused', () => {
    expect(oddsPullBlockReason({ ...ok, paused: true })).toMatch(/Paused/);
  });

  it('blocks once the monthly budget would be exceeded', () => {
    expect(oddsPullBlockReason({ ...ok, monthCreditsUsed: ODDS_MONTHLY_BUDGET - ODDS_CREDITS_PER_PULL })).toBeNull();
    expect(oddsPullBlockReason({ ...ok, monthCreditsUsed: ODDS_MONTHLY_BUDGET - ODDS_CREDITS_PER_PULL + 1 })).toMatch(
      /budget/,
    );
  });

  it('blocks when the API reports few credits left', () => {
    expect(oddsPullBlockReason({ ...ok, apiRemaining: 49 })).toMatch(/49 credits left/);
    expect(oddsPullBlockReason({ ...ok, apiRemaining: 50 })).toBeNull();
  });

  it('keeps the worst-case schedule inside the budget', () => {
    expect(ODDS_WORST_CASE_MONTH_CREDITS).toBe(399);
    expect(ODDS_WORST_CASE_MONTH_CREDITS).toBeLessThan(ODDS_MONTHLY_BUDGET);
    expect(ODDS_MONTHLY_BUDGET).toBeLessThan(ODDS_FREE_TIER_CREDITS);
  });
});

describe('eligibleOddsGames', () => {
  const lockAt = Date.parse('2026-10-09T20:00:00Z'); // Fri 4:00 PM ET
  const at = (iso: string) => ({ id: iso, commenceMs: Date.parse(iso) });

  it('keeps Friday-after-lock through Monday night, drops Thursday and next week', () => {
    const games = [
      at('2026-10-09T00:15:00Z'), // Thu night (TNF)
      at('2026-10-09T19:59:00Z'), // a minute before lock
      at('2026-10-09T20:00:00Z'), // exactly at lock
      at('2026-10-09T23:30:00Z'), // Fri 7:30 PM college
      at('2026-10-11T13:30:00Z'), // Sun 9:30 AM ET (London)
      at('2026-10-11T17:00:00Z'), // Sun 1 PM
      at('2026-10-13T00:15:00Z'), // Mon night
      at('2026-10-16T00:15:00Z'), // next Thu
    ];
    expect(eligibleOddsGames(games, lockAt).map((g) => g.id)).toEqual([
      '2026-10-09T20:00:00Z',
      '2026-10-09T23:30:00Z',
      '2026-10-11T13:30:00Z',
      '2026-10-11T17:00:00Z',
      '2026-10-13T00:15:00Z',
    ]);
  });
});
