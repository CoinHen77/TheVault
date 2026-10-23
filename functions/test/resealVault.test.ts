import { beforeEach, describe, expect, it } from 'vitest';
import type { Week } from '@vault/shared';
import { deleteBookBetLogic, placeBookBetLogic } from '../src/logic/bookBets.js';
import { markBuyInPaidLogic } from '../src/logic/buyIns.js';
import { lockDueWeeksLogic, openVaultEarlyLogic, resealVaultLogic } from '../src/logic/lock.js';
import { announceBookLogic, type PushSender } from '../src/logic/notify.js';
import { submitPickLogic } from '../src/logic/picks.js';
import { createSeasonLogic } from '../src/logic/season.js';
import { bookBetsCol, weekDoc } from '../src/paths.js';
import { clearFirestore, db } from './helpers/emulator.js';
import { seedPlayers } from './helpers/seed.js';

const SEASON_ID = 'reseal-season';
const W = { seasonId: SEASON_ID, weekId: 'W04' };
const noPush: PushSender = { send: async () => ({ deadTokens: [] }) };

async function week(): Promise<Week> {
  return (await weekDoc(db, SEASON_ID, 'W04').get()).data() as Week;
}

async function pay(uid: string) {
  await markBuyInPaidLogic(db, { ...W, playerId: uid, markedBy: 'admin' });
}

function seal(uid: string, pickText = 'x') {
  return submitPickLogic(db, { ...W, uid, pickText, gameText: 'y', americanOdds: -110 });
}

function placeBet() {
  return placeBookBetLogic(db, { ...W, uid: 'P1', isAdmin: false, legPickIds: ['P2'], stakeCents: 200, ticketOdds: -110 });
}

beforeEach(async () => {
  await clearFirestore();
  await seedPlayers(['P1', 'P2', 'P3']);
  await createSeasonLogic(db, {
    seasonId: SEASON_ID,
    name: 'Reseal',
    adminUid: 'P1',
    week4LockAtMs: Date.now() + 3 * 86_400_000,
  });
  await pay('P2');
  await seal('P2');
  await openVaultEarlyLogic(db, W);
});

describe('resealVaultLogic', () => {
  it('reopens a locked week with a new deadline, deleting the Book bets and the announce/reminder flags', async () => {
    await placeBet();
    await announceBookLogic(db, noPush, { ...W, uid: 'P1', isAdmin: false });
    const lockAtMs = Date.now() + 3_600_000;

    expect(await resealVaultLogic(db, { ...W, lockAtMs })).toEqual({ deletedBets: 1 });

    const w = await week();
    expect(w.status).toBe('open');
    expect(w.lockAt.toMillis()).toBe(lockAtMs);
    expect(w.resealedAt).toBeDefined();
    expect(w.bookAnnouncedAt).toBeUndefined();
    expect(w.remindersSent).toBeUndefined();
    expect((await bookBetsCol(db, SEASON_ID, 'W04').get()).empty).toBe(true);
  });

  it('lets a late player pay in and seal, keeps earlier picks final, and re-snapshots at the next lock', async () => {
    const lockAtMs = Date.now() + 3_600_000;
    await resealVaultLogic(db, { ...W, lockAtMs });

    await pay('P3');
    await seal('P3');
    await expect(seal('P2', 'changed')).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/final/),
    });

    expect((await lockDueWeeksLogic(db, { nowMs: lockAtMs })).lockedWeekIds).toEqual(['W04']);
    const w = await week();
    expect(w.status).toBe('locked');
    expect(w.openingVaultCents).toBe(2000); // both buy-ins
    expect(w.bookCapCents).toBe(500);
  });

  it('rejects a deadline in the past', async () => {
    await expect(resealVaultLogic(db, { ...W, lockAtMs: Date.now() - 1000 })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect((await week()).status).toBe('locked');
  });

  it('rejects a week that is not locked', async () => {
    await resealVaultLogic(db, { ...W, lockAtMs: Date.now() + 3_600_000 });
    await expect(resealVaultLogic(db, { ...W, lockAtMs: Date.now() + 3_600_000 })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects missing ids or deadline', async () => {
    await expect(resealVaultLogic(db, { seasonId: SEASON_ID, weekId: '', lockAtMs: 1 })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(resealVaultLogic(db, { ...W, lockAtMs: 'soon' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('deleteBookBetLogic after "Book\'s in"', () => {
  it('lets the key holder delete until the crew is told, then only the Admin', async () => {
    const { betId: first } = await placeBet();
    await deleteBookBetLogic(db, { ...W, betId: first, uid: 'P1', isAdmin: false });

    const { betId } = await placeBet();
    await announceBookLogic(db, noPush, { ...W, uid: 'P1', isAdmin: false });
    await expect(deleteBookBetLogic(db, { ...W, betId, uid: 'P1', isAdmin: false })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    await deleteBookBetLogic(db, { ...W, betId, uid: 'admin', isAdmin: true });
    expect((await bookBetsCol(db, SEASON_ID, 'W04').get()).empty).toBe(true);
  });
});
