import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OddsGameBase, Pick as PickDoc, PickLine, PushMessage } from '@vault/shared';
import { markBuyInPaidLogic } from '../src/logic/buyIns.js';
import { linkedSportsForWeek, priceWeekAtOpenLogic, refreshPickLinesLogic } from '../src/logic/lineMoves.js';
import { openVaultEarlyLogic } from '../src/logic/lock.js';
import type { PushSender } from '../src/logic/notify.js';
import { pullOddsLogic, setOddsPausedLogic } from '../src/logic/odds.js';
import { adjustPickAtOpenLogic, adminSubmitPickLogic, gradePickLogic, submitPickLogic } from '../src/logic/picks.js';
import { createSeasonLogic } from '../src/logic/season.js';
import { startGradingLogic } from '../src/logic/weekLifecycle.js';
import { pickDoc } from '../src/paths.js';
import { clearFirestore, db } from './helpers/emulator.js';
import { seedPlayers } from './helpers/seed.js';

const SEASON_ID = 'line-season';
const W = { seasonId: SEASON_ID, weekId: 'W04' };
const H = 3_600_000;
const BEARS: PickLine = { sport: 'nfl', eventId: 'evt1', choice: 'spreadAway', point: -2.5 };

function fakeSender() {
  const sent: { tokens: string[]; message: PushMessage }[] = [];
  const sender: PushSender = {
    async send(tokens, message) {
      sent.push({ tokens, message });
      return { deadTokens: [] };
    },
  };
  return { sender, sent };
}

/** The Bears @ Panthers game with the Bears spread at `point` / `odds`. */
function games(point: number, odds: number): OddsGameBase[] {
  return [
    {
      eventId: 'evt1',
      homeTeam: 'Carolina Panthers',
      awayTeam: 'Chicago Bears',
      lines: { spreadAway: { odds, point }, spreadHome: { odds: -105, point: -point } },
    },
  ];
}

async function pick(uid: string): Promise<PickDoc> {
  return (await pickDoc(db, SEASON_ID, 'W04', uid).get()).data() as PickDoc;
}

/** `line: null` seals it as if typed in by hand. */
async function sealBears(uid: string, odds = -110, line: PickLine | null = BEARS) {
  await submitPickLogic(db, { ...W, uid, pickText: 'Bears -2.5', gameText: 'CHI @ CAR', americanOdds: odds, line });
}

let lockAtMs: number;

beforeEach(async () => {
  await clearFirestore();
  await seedPlayers(['P1', 'P2']);
  lockAtMs = Date.now() + 3 * 24 * H;
  await createSeasonLogic(db, { seasonId: SEASON_ID, name: 'Lines', adminUid: 'P1', week4LockAtMs: lockAtMs });
  for (const uid of ['P1', 'P2']) {
    await markBuyInPaidLogic(db, { ...W, playerId: uid, markedBy: 'admin' });
    await db.collection('pushTokens').doc(`tok-${uid}`).set({ uid, platform: 'test', createdAt: Timestamp.now() });
  }
});

describe('submitPick with a board line', () => {
  it('stores the line, and rejects a malformed one', async () => {
    await sealBears('P1');
    expect((await pick('P1')).line).toEqual(BEARS);
    await expect(
      submitPickLogic(db, { ...W, uid: 'P2', pickText: 'x', gameText: 'y', americanOdds: -110, line: { sport: 'nba' } }),
    ).rejects.toThrow(/line/);
  });
});

describe('refreshPickLinesLogic', () => {
  it('pushes once per seal when the line moves, and leaves typed-in picks alone', async () => {
    await sealBears('P1');
    await sealBears('P2', -110, null);
    const { sender, sent } = fakeSender();

    const first = await refreshPickLinesLogic(db, sender, { sport: 'nfl', games: games(-3, -115) });
    expect(first).toEqual({ updated: 1, alerted: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.tokens).toEqual(['tok-P1']);
    expect(sent[0]!.message.body).toBe(
      'You sealed Bears -2.5 (-110). DraftKings has it at Bears -3 (-115) now, and the line when the vault opens is what counts. Reseal, pick something else, or keep it.',
    );
    const p1 = await pick('P1');
    expect(p1.lineNow).toMatchObject({ odds: -115, point: -3, pickText: 'Bears -3' });
    expect(p1.lineAlertedAt).toBeDefined();
    expect((await pick('P2')).lineNow).toBeUndefined();

    // Moving again doesn't push again, but the price still updates.
    await refreshPickLinesLogic(db, sender, { sport: 'nfl', games: games(-3.5, -110) });
    expect(sent).toHaveLength(1);
    expect((await pick('P1')).lineNow).toMatchObject({ odds: -110, point: -3.5 });

    // A reseal clears the alert, so the next move pushes again.
    await sealBears('P1');
    expect((await pick('P1')).lineAlertedAt).toBeUndefined();
    await refreshPickLinesLogic(db, sender, { sport: 'nfl', games: games(-3.5, -110) });
    expect(sent).toHaveLength(2);
  });

  it('records a small move without pushing', async () => {
    await sealBears('P1');
    const { sender, sent } = fakeSender();
    await refreshPickLinesLogic(db, sender, { sport: 'nfl', games: games(-2.5, -114) });
    expect(sent).toHaveLength(0);
    const p1 = await pick('P1');
    expect(p1.lineNow).toMatchObject({ odds: -114, point: -2.5 });
    expect(p1.lineAlertedAt).toBeUndefined();
  });

  it('respects the player turning line alerts off', async () => {
    await sealBears('P1');
    await db.collection('notificationPrefs').doc('P1').set({ lineMoves: false });
    const { sender, sent } = fakeSender();
    await refreshPickLinesLogic(db, sender, { sport: 'nfl', games: games(-3, -115) });
    expect(sent).toHaveLength(0);
  });

  it('after the vault opens, updates prices for the key holder but pushes no one', async () => {
    await sealBears('P1');
    await sealBears('P2', -110, null);
    await openVaultEarlyLogic(db, W);
    expect(await linkedSportsForWeek(db, SEASON_ID, 'W04')).toEqual(['nfl']);

    const { sender, sent } = fakeSender();
    const result = await refreshPickLinesLogic(db, sender, { sport: 'nfl', games: games(-3, -120) });
    expect(result).toEqual({ updated: 1, alerted: 0 });
    expect(sent).toHaveLength(0);
    expect((await pick('P1')).lineNow).toMatchObject({ odds: -120, point: -3 });
  });

  it('ignores the other sport and lines DraftKings dropped', async () => {
    await sealBears('P1');
    const { sender, sent } = fakeSender();
    expect(await refreshPickLinesLogic(db, sender, { sport: 'ncaaf', games: games(-3, -115) })).toEqual({
      updated: 0,
      alerted: 0,
    });
    expect(await refreshPickLinesLogic(db, sender, { sport: 'nfl', games: [] })).toEqual({ updated: 0, alerted: 0 });
    expect(sent).toHaveLength(0);
  });
});

describe('pullOddsLogic and line moves', () => {
  const body = [
    {
      id: 'evt1',
      commence_time: new Date(Date.now() + 4 * 24 * H).toISOString(),
      home_team: 'Carolina Panthers',
      away_team: 'Chicago Bears',
      bookmakers: [
        {
          key: 'draftkings',
          markets: [
            {
              key: 'spreads',
              outcomes: [
                { name: 'Chicago Bears', price: -110, point: -3.5 },
                { name: 'Carolina Panthers', price: -110, point: 3.5 },
              ],
            },
          ],
        },
      ],
    },
  ];
  const fetchImpl = () =>
    vi.fn(
      async () => new Response(JSON.stringify(body), { status: 200, headers: { 'x-requests-last': '3' } }),
    ) as unknown as typeof fetch;

  it('checks sealed picks after every pull', async () => {
    await sealBears('P1');
    const { sender, sent } = fakeSender();
    await pullOddsLogic(db, { apiKey: 'fake', trigger: 'manual', sender, fetchImpl: fetchImpl() });
    expect(sent).toHaveLength(1);
    expect((await pick('P1')).lineNow).toMatchObject({ odds: -110, point: -3.5 });
  });

  it('skips the vault-opening pull while the feed is paused', async () => {
    await setOddsPausedLogic(db, { paused: true });
    const f = fetchImpl();
    const result = await pullOddsLogic(db, { apiKey: 'fake', trigger: 'lock', fetchImpl: f });
    expect(result.outcome).toBe('skipped');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('priceWeekAtOpenLogic', () => {
  it('moves board picks to the vault-open line and grades at those odds', async () => {
    await sealBears('P1');
    await sealBears('P2', -110, null);
    await refreshPickLinesLogic(db, null, { sport: 'nfl', games: games(-3, -125) });
    await openVaultEarlyLogic(db, W);

    expect(await priceWeekAtOpenLogic(db, W)).toEqual({ repriced: ['P1'] });
    const p1 = await pick('P1');
    expect(p1).toMatchObject({
      pickText: 'Bears -3',
      americanOdds: -125,
      line: { ...BEARS, point: -3 },
      sealed: { pickText: 'Bears -2.5', americanOdds: -110, point: -2.5 },
    });
    expect(p1.pricedAtOpenAt).toBeDefined();
    expect((await pick('P2')).americanOdds).toBe(-110);

    // Only once, even if prices move again after the vault opens.
    await refreshPickLinesLogic(db, null, { sport: 'nfl', games: games(-3.5, -110) });
    expect(await priceWeekAtOpenLogic(db, W)).toEqual({ repriced: [] });
    expect((await pick('P1')).americanOdds).toBe(-125);

    await startGradingLogic(db, W);
    expect(await gradePickLogic(db, { ...W, playerId: 'P1', result: 'win' })).toEqual({ units: 0.8 });
  });

  it('does nothing while the vault is sealed, or to a pick the Admin replaced', async () => {
    await sealBears('P1');
    await sealBears('P2');
    await refreshPickLinesLogic(db, null, { sport: 'nfl', games: games(-3, -125) });
    expect(await priceWeekAtOpenLogic(db, W)).toEqual({ repriced: [] });

    await openVaultEarlyLogic(db, W);
    await adminSubmitPickLogic(db, { ...W, playerId: 'P2', pickText: 'Bears ML', gameText: 'CHI @ CAR', americanOdds: 130, enteredBy: 'P1' });
    expect(await priceWeekAtOpenLogic(db, W)).toEqual({ repriced: ['P1'] });
    expect((await pick('P2')).americanOdds).toBe(130);
  });
});

describe('adjustPickAtOpenLogic', () => {
  const kelce = { ...W, playerId: 'P2', adjustedBy: 'P1' };

  beforeEach(async () => {
    await sealBears('P1');
    await submitPickLogic(db, { ...W, uid: 'P2', pickText: 'Kelce o5.5 rec', gameText: 'KC @ LV', americanOdds: -110 });
  });

  it('is only allowed while the vault is open', async () => {
    await expect(adjustPickAtOpenLogic(db, { ...kelce, pickText: 'Kelce o6.5 rec', americanOdds: -105 })).rejects.toThrow(
      /vault is open/,
    );
  });

  it('sets the open line, keeps the first seal, and grades at it', async () => {
    await openVaultEarlyLogic(db, W);
    await adjustPickAtOpenLogic(db, { ...kelce, pickText: 'Kelce o6.5 rec', americanOdds: -105 });
    await adjustPickAtOpenLogic(db, { ...kelce, pickText: 'Kelce o6.5 rec', americanOdds: 100 });
    expect(await pick('P2')).toMatchObject({
      pickText: 'Kelce o6.5 rec',
      americanOdds: 100,
      sealed: { pickText: 'Kelce o5.5 rec', americanOdds: -110, point: null },
      priceAdjustedBy: 'P1',
    });

    await startGradingLogic(db, W);
    expect(await gradePickLogic(db, { ...W, playerId: 'P2', result: 'win' })).toEqual({ units: 1 });
    await expect(adjustPickAtOpenLogic(db, { ...kelce, pickText: 'x', americanOdds: 100 })).rejects.toThrow(/vault is open/);
  });

  it('rejects bad input', async () => {
    await openVaultEarlyLogic(db, W);
    await expect(adjustPickAtOpenLogic(db, { ...kelce, pickText: 'x', americanOdds: -99 })).rejects.toThrow(/odds/);
    await expect(adjustPickAtOpenLogic(db, { ...kelce, pickText: '  ', americanOdds: -110 })).rejects.toThrow(/pickText/);
    await expect(adjustPickAtOpenLogic(db, { ...kelce, playerId: 'nobody', pickText: 'x', americanOdds: -110 })).rejects.toThrow(
      /No pick/,
    );
  });
});
