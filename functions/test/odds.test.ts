import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ODDS_MONTHLY_BUDGET, type OddsFeed, type OddsUsageMonth } from '@vault/shared';
import { parseOddsSport, pullOddsLogic, setOddsPausedLogic } from '../src/logic/odds.js';
import { createSeasonLogic } from '../src/logic/season.js';
import { oddsFeedDoc, oddsUsageDoc, weekDoc } from '../src/paths.js';
import { clearFirestore, db } from './helpers/emulator.js';
import { seedPlayers } from './helpers/seed.js';

const NOW = Date.parse('2026-10-06T16:00:00Z'); // Tue 12:00 PM ET
const MONTH = '2026-10';
const FAKE_KEY = 'fake-key-123';

/** One fake game, shaped like The Odds API v4 response. */
const BODY = [
  {
    id: 'evt1',
    commence_time: '2026-10-11T17:00:00Z',
    home_team: 'Carolina Panthers',
    away_team: 'Chicago Bears',
    bookmakers: [
      {
        key: 'draftkings',
        markets: [
          { key: 'h2h', outcomes: [{ name: 'Chicago Bears', price: -140 }, { name: 'Carolina Panthers', price: 118 }] },
        ],
      },
    ],
  },
];

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async (_url: URL | RequestInfo) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const okHeaders = { 'x-requests-last': '3', 'x-requests-used': '12', 'x-requests-remaining': '488' };

async function usage(): Promise<OddsUsageMonth> {
  return (await oddsUsageDoc(db, MONTH).get()).data() as OddsUsageMonth;
}

describe('pullOddsLogic', () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedPlayers(['P1']);
    await createSeasonLogic(db, { seasonId: 'odds-season', name: 'Test', adminUid: 'P1', week4LockAtMs: NOW + 5 * 86_400_000 });
  });

  it('writes the feed and records the call and credits', async () => {
    const fetchImpl = fakeFetch(200, BODY, okHeaders);
    const result = await pullOddsLogic(db, { apiKey: FAKE_KEY, trigger: 'schedule', nowMs: NOW, fetchImpl });

    expect(result).toEqual({ outcome: 'ok', games: 1, credits: 3, message: null });
    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.pathname).toBe('/v4/sports/americanfootball_nfl/odds');
    expect(url.searchParams.get('bookmakers')).toBe('draftkings');
    expect(url.searchParams.get('markets')).toBe('h2h,spreads,totals');

    const feed = (await oddsFeedDoc(db).get()).data() as OddsFeed;
    expect(feed.games).toHaveLength(1);
    expect(feed.games[0]!.lines.mlAway).toEqual({ odds: -140, point: null });
    expect(feed.games[0]!.commenceAt.toMillis()).toBe(Date.parse('2026-10-11T17:00:00Z'));

    const u = await usage();
    expect(u).toMatchObject({ calls: 1, creditsUsed: 3, errors: 0, skipped: 0, apiUsed: 12, apiRemaining: 488 });
    expect(u.log[0]).toMatchObject({ trigger: 'schedule', outcome: 'ok', credits: 3, games: 1 });
  });

  it('uses the API-reported cost, not the reservation', async () => {
    await pullOddsLogic(db, {
      apiKey: FAKE_KEY,
      trigger: 'manual',
      nowMs: NOW,
      fetchImpl: fakeFetch(200, [], { ...okHeaders, 'x-requests-last': '0' }),
    });
    expect((await usage()).creditsUsed).toBe(0);
  });

  it('skips scheduled pulls when no week is open, without calling the API', async () => {
    await weekDoc(db, 'odds-season', 'W04').update({ status: 'locked' });
    const fetchImpl = fakeFetch(200, BODY, okHeaders);
    const result = await pullOddsLogic(db, { apiKey: FAKE_KEY, trigger: 'schedule', nowMs: NOW, fetchImpl });

    expect(result.outcome).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await usage()).toMatchObject({ calls: 0, creditsUsed: 0, skipped: 1 });
  });

  it('skips scheduled pulls once lockAt has passed, even before lockDueWeeks runs', async () => {
    const lockAtMs = (await weekDoc(db, 'odds-season', 'W04').get()).get('lockAt').toMillis() as number;
    const fetchImpl = fakeFetch(200, BODY, okHeaders);
    const result = await pullOddsLogic(db, { apiKey: FAKE_KEY, trigger: 'schedule', nowMs: lockAtMs, fetchImpl });

    expect(result.outcome).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('pulls college lines into their own feed doc', async () => {
    await pullOddsLogic(db, { apiKey: FAKE_KEY, trigger: 'manual', nowMs: NOW, fetchImpl: fakeFetch(200, BODY, okHeaders) });
    const fetchImpl = fakeFetch(200, [], okHeaders);
    const result = await pullOddsLogic(db, { apiKey: FAKE_KEY, trigger: 'schedule', sport: 'ncaaf', nowMs: NOW, fetchImpl });

    expect(result.outcome).toBe('ok');
    expect(new URL(String(fetchImpl.mock.calls[0]![0])).pathname).toBe('/v4/sports/americanfootball_ncaaf/odds');
    expect(((await oddsFeedDoc(db, 'ncaaf').get()).data() as OddsFeed).games).toHaveLength(0);
    expect(((await oddsFeedDoc(db).get()).data() as OddsFeed).games).toHaveLength(1); // NFL feed untouched
    const u = await usage();
    expect(u.creditsUsed).toBe(6); // one shared budget
    expect(u.log.map((e) => e.sport)).toEqual(['ncaaf', 'nfl']);
  });

  it('pause stops the schedule but not "Pull now"', async () => {
    await setOddsPausedLogic(db, { paused: true });
    const fetchImpl = fakeFetch(200, BODY, okHeaders);

    expect((await pullOddsLogic(db, { apiKey: FAKE_KEY, trigger: 'schedule', nowMs: NOW, fetchImpl })).outcome).toBe(
      'skipped',
    );
    expect(fetchImpl).not.toHaveBeenCalled();

    expect((await pullOddsLogic(db, { apiKey: FAKE_KEY, trigger: 'manual', nowMs: NOW, fetchImpl })).outcome).toBe('ok');
  });

  it('stops at the monthly budget', async () => {
    await oddsUsageDoc(db, MONTH).set({ monthKey: MONTH, calls: 0, creditsUsed: ODDS_MONTHLY_BUDGET - 2, errors: 0, skipped: 0, apiUsed: null, apiRemaining: null, lastCallAt: null, lastError: null, lastErrorAt: null, log: [] });
    const fetchImpl = fakeFetch(200, BODY, okHeaders);
    const result = await pullOddsLogic(db, { apiKey: FAKE_KEY, trigger: 'manual', nowMs: NOW, fetchImpl });

    expect(result).toMatchObject({ outcome: 'skipped', message: expect.stringMatching(/budget/) });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('stops when the API reports few credits left', async () => {
    await pullOddsLogic(db, {
      apiKey: FAKE_KEY,
      trigger: 'manual',
      nowMs: NOW,
      fetchImpl: fakeFetch(200, BODY, { ...okHeaders, 'x-requests-remaining': '40' }),
    });
    const fetchImpl = fakeFetch(200, BODY, okHeaders);
    const result = await pullOddsLogic(db, { apiKey: FAKE_KEY, trigger: 'manual', nowMs: NOW, fetchImpl });
    expect(result.outcome).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('records an HTTP error, keeps the old feed, and never stores the key', async () => {
    await pullOddsLogic(db, { apiKey: FAKE_KEY, trigger: 'manual', nowMs: NOW, fetchImpl: fakeFetch(200, BODY, okHeaders) });

    const result = await pullOddsLogic(db, {
      apiKey: FAKE_KEY,
      trigger: 'manual',
      nowMs: NOW + 1000,
      fetchImpl: fakeFetch(401, `{"message":"Invalid key ${FAKE_KEY}"}`, { 'x-requests-last': '0' }),
    });

    expect(result.outcome).toBe('error');
    const u = await usage();
    expect(u).toMatchObject({ calls: 2, creditsUsed: 3, errors: 1 });
    expect(u.lastError).toMatch(/^HTTP 401/);
    expect(JSON.stringify(u)).not.toContain(FAKE_KEY);
    expect(((await oddsFeedDoc(db).get()).data() as OddsFeed).games).toHaveLength(1);
  });

  it('records a network failure as free', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(`connect ECONNREFUSED ?apiKey=${FAKE_KEY}`);
    }) as unknown as typeof fetch;
    const result = await pullOddsLogic(db, { apiKey: FAKE_KEY, trigger: 'manual', nowMs: NOW, fetchImpl });

    expect(result.outcome).toBe('error');
    const u = await usage();
    expect(u).toMatchObject({ calls: 1, creditsUsed: 0, errors: 1 });
    expect(u.lastError).not.toContain(FAKE_KEY);
  });

  it('records a missing key without calling the API', async () => {
    const fetchImpl = fakeFetch(200, BODY, okHeaders);
    const result = await pullOddsLogic(db, { apiKey: '', trigger: 'manual', nowMs: NOW, fetchImpl });

    expect(result).toMatchObject({ outcome: 'error', message: expect.stringMatching(/ODDS_API_KEY/) });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await usage()).toMatchObject({ calls: 0, errors: 1 });
  });

  it('two pulls at once both count', async () => {
    await Promise.all([
      pullOddsLogic(db, { apiKey: FAKE_KEY, trigger: 'manual', nowMs: NOW, fetchImpl: fakeFetch(200, BODY, okHeaders) }),
      pullOddsLogic(db, { apiKey: FAKE_KEY, trigger: 'manual', nowMs: NOW, fetchImpl: fakeFetch(200, BODY, okHeaders) }),
    ]);
    expect(await usage()).toMatchObject({ calls: 2, creditsUsed: 6 });
    expect((await usage()).log).toHaveLength(2);
  });
});

describe('parseOddsSport', () => {
  it('defaults to NFL and rejects unknown sports', () => {
    expect(parseOddsSport(undefined)).toBe('nfl');
    expect(parseOddsSport('ncaaf')).toBe('ncaaf');
    expect(() => parseOddsSport('nba')).toThrow(/sport must be/);
  });
});

describe('setOddsPausedLogic', () => {
  it('rejects a non-boolean', async () => {
    await expect(setOddsPausedLogic(db, { paused: 'yes' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
