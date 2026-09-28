import { beforeEach, describe, expect, it } from 'vitest';
import { placeBookBetLogic } from '../src/logic/bookBets.js';
import { submitPickLogic } from '../src/logic/picks.js';
import { createSeasonLogic } from '../src/logic/season.js';
import { closeWeekLogic, startGradingLogic } from '../src/logic/weekLifecycle.js';
import { markBuyInPaidLogic } from '../src/logic/buyIns.js';
import { lockDueWeeksLogic } from '../src/logic/lock.js';
import { clearFirestore, db } from './helpers/emulator.js';
import { seedPlayers } from './helpers/seed.js';

/** SPEC.md §9.3 guards. */
describe('§9.3 guards', () => {
  const SEASON_ID = 'guard-season';

  beforeEach(async () => {
    await clearFirestore();
    await seedPlayers(['P1', 'P2']);
  });

  it('rejects submitPick from an unpaid player', async () => {
    await createSeasonLogic(db, { seasonId: SEASON_ID, name: 'Guards', adminUid: 'P1', week4LockAtMs: Date.now() + 60_000 });

    await expect(
      submitPickLogic(db, { seasonId: SEASON_ID, weekId: 'W04', uid: 'P1', pickText: 'x', gameText: 'y', americanOdds: -110 }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects submitPick after lockAt', async () => {
    await createSeasonLogic(db, { seasonId: SEASON_ID, name: 'Guards', adminUid: 'P1', week4LockAtMs: Date.now() + 5_000 });
    await markBuyInPaidLogic(db, { seasonId: SEASON_ID, weekId: 'W04', playerId: 'P1', markedBy: 'admin' });

    await expect(
      submitPickLogic(db, {
        seasonId: SEASON_ID,
        weekId: 'W04',
        uid: 'P1',
        pickText: 'x',
        gameText: 'y',
        americanOdds: -110,
        nowMs: Date.now() + 5_001,
      }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects placeBookBet whose total stakes exceed the cap by 1 cent', async () => {
    const lockAtMs = Date.now() + 5_000;
    await createSeasonLogic(db, { seasonId: SEASON_ID, name: 'Guards', adminUid: 'P1', week4LockAtMs: lockAtMs });
    await markBuyInPaidLogic(db, { seasonId: SEASON_ID, weekId: 'W04', playerId: 'P1', markedBy: 'admin' });
    await submitPickLogic(db, { seasonId: SEASON_ID, weekId: 'W04', uid: 'P1', pickText: 'x', gameText: 'y', americanOdds: -110 });
    await lockDueWeeksLogic(db, { nowMs: lockAtMs + 1 });
    // Opening Vault $10 -> cap floor(1000*0.25) = 250¢.

    await expect(
      placeBookBetLogic(db, {
        seasonId: SEASON_ID,
        weekId: 'W04',
        uid: 'P1',
        isAdmin: false,
        legPickIds: ['P1'],
        stakeCents: 251,
        ticketOdds: -110,
      }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects placeBookBet with a leg from another week', async () => {
    const lockAtMs = Date.now() + 5_000;
    await createSeasonLogic(db, { seasonId: SEASON_ID, name: 'Guards', adminUid: 'P1', week4LockAtMs: lockAtMs });
    await markBuyInPaidLogic(db, { seasonId: SEASON_ID, weekId: 'W04', playerId: 'P1', markedBy: 'admin' });
    await submitPickLogic(db, { seasonId: SEASON_ID, weekId: 'W04', uid: 'P1', pickText: 'x', gameText: 'y', americanOdds: -110 });
    await lockDueWeeksLogic(db, { nowMs: lockAtMs + 1 });

    await expect(
      placeBookBetLogic(db, {
        seasonId: SEASON_ID,
        weekId: 'W04',
        uid: 'P1',
        isAdmin: false,
        legPickIds: ['P2'], // P2 never submitted a pick for W04
        stakeCents: 100,
        ticketOdds: -110,
      }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects closeWeek with any pending result', async () => {
    const lockAtMs = Date.now() + 5_000;
    await createSeasonLogic(db, { seasonId: SEASON_ID, name: 'Guards', adminUid: 'P1', week4LockAtMs: lockAtMs });
    await markBuyInPaidLogic(db, { seasonId: SEASON_ID, weekId: 'W04', playerId: 'P1', markedBy: 'admin' });
    await submitPickLogic(db, { seasonId: SEASON_ID, weekId: 'W04', uid: 'P1', pickText: 'x', gameText: 'y', americanOdds: -110 });
    await lockDueWeeksLogic(db, { nowMs: lockAtMs + 1 });
    await startGradingLogic(db, { seasonId: SEASON_ID, weekId: 'W04' });
    // P1's pick is never graded — result stays 'pending'.

    await expect(closeWeekLogic(db, { seasonId: SEASON_ID, weekId: 'W04', adminUid: 'P1' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});
