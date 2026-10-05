import { beforeEach, describe, expect, it } from 'vitest';
import type { Week } from '@vault/shared';
import { markBuyInPaidLogic } from '../src/logic/buyIns.js';
import { openVaultEarlyLogic } from '../src/logic/lock.js';
import { submitPickLogic } from '../src/logic/picks.js';
import { createSeasonLogic } from '../src/logic/season.js';
import { weekDoc } from '../src/paths.js';
import { clearFirestore, db } from './helpers/emulator.js';
import { seedPlayers } from './helpers/seed.js';

describe('openVaultEarlyLogic', () => {
  const SEASON_ID = 'early-season';
  const ids = { seasonId: SEASON_ID, weekId: 'W04' };
  const lockAtMs = Date.now() + 3 * 86_400_000;

  async function week(): Promise<Week> {
    return (await weekDoc(db, SEASON_ID, 'W04').get()).data() as Week;
  }

  async function payAndPick(uid: string, pick = true) {
    await markBuyInPaidLogic(db, { seasonId: SEASON_ID, weekId: 'W04', playerId: uid, markedBy: 'admin' });
    if (pick) {
      await submitPickLogic(db, { seasonId: SEASON_ID, weekId: 'W04', uid, pickText: 'x', gameText: 'y', americanOdds: -110 });
    }
  }

  beforeEach(async () => {
    await clearFirestore();
    await seedPlayers(['P1', 'P2', 'P3']);
    await createSeasonLogic(db, { seasonId: SEASON_ID, name: 'Early', adminUid: 'P1', week4LockAtMs: lockAtMs });
  });

  it('locks once every paid player has a pick, with the same snapshot as lockDueWeeks', async () => {
    await payAndPick('P1');
    await payAndPick('P2');

    await openVaultEarlyLogic(db, ids);

    const w = await week();
    expect(w.status).toBe('locked');
    expect(w.openingVaultCents).toBe(2000);
    expect(w.bookCapCents).toBe(500);
    expect(w.lockAt.toMillis()).toBe(lockAtMs); // still the eligibility cutoff
  });

  it('rejects while a paid player has no pick', async () => {
    await payAndPick('P1');
    await payAndPick('P2', false);

    await expect(openVaultEarlyLogic(db, ids)).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/1 paid player has not sealed/),
    });
    expect((await week()).status).toBe('open');
  });

  it('rejects when no one has paid', async () => {
    await expect(openVaultEarlyLogic(db, ids)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects a week that is not open', async () => {
    await payAndPick('P1');
    await openVaultEarlyLogic(db, ids);
    await expect(openVaultEarlyLogic(db, ids)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects missing ids', async () => {
    await expect(openVaultEarlyLogic(db, { seasonId: SEASON_ID, weekId: '' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});
