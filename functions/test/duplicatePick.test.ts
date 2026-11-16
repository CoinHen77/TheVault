import { beforeEach, describe, expect, it } from 'vitest';
import type { Pick as PickDoc, PickLine } from '@vault/shared';
import { markBuyInPaidLogic } from '../src/logic/buyIns.js';
import { DUPLICATE_PICK_REASON, submitPickLogic } from '../src/logic/picks.js';
import { createSeasonLogic } from '../src/logic/season.js';
import { pickDoc } from '../src/paths.js';
import { clearFirestore, db } from './helpers/emulator.js';
import { seedPlayers } from './helpers/seed.js';

const SEASON_ID = 'dup-season';
const W = { seasonId: SEASON_ID, weekId: 'W04' };
const BEARS: PickLine = { sport: 'nfl', eventId: 'evt1', choice: 'spreadHome', point: -2.5 };

function seal(uid: string, pickText: string, extra: { line?: PickLine; allowDuplicate?: boolean } = {}) {
  return submitPickLogic(db, { ...W, uid, pickText, gameText: 'CHI @ CAR', americanOdds: -110, ...extra });
}

async function pick(uid: string): Promise<PickDoc | undefined> {
  return (await pickDoc(db, SEASON_ID, 'W04', uid).get()).data() as PickDoc | undefined;
}

beforeEach(async () => {
  await clearFirestore();
  await seedPlayers(['P1', 'P2']);
  await createSeasonLogic(db, { seasonId: SEASON_ID, name: 'Dup', adminUid: 'P1', week4LockAtMs: Date.now() + 86_400_000 });
  for (const playerId of ['P1', 'P2']) await markBuyInPaidLogic(db, { ...W, playerId, markedBy: 'admin' });
  await seal('P1', 'Bears -2.5', { line: BEARS });
});

describe('submitPick duplicate warning', () => {
  it('rejects a pick another player sealed, without saying who, and saves nothing', async () => {
    const err = await seal('P2', 'bears  −2.5').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'already-exists', details: { reason: DUPLICATE_PICK_REASON } });
    expect(String((err as Error).message)).not.toMatch(/P1/);
    expect(await pick('P2')).toBeUndefined();
  });

  it('matches board picks on the same side at a different line', async () => {
    await expect(seal('P2', 'Bears -3', { line: { ...BEARS, point: -3 } })).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('seals the duplicate once the player confirms', async () => {
    await seal('P2', 'Bears -2.5', { line: BEARS, allowDuplicate: true });
    expect((await pick('P2'))?.pickText).toBe('Bears -2.5');
  });

  it('lets a player reseal their own pick and seal a different one', async () => {
    await seal('P1', 'Bears -3', { line: { ...BEARS, point: -3 } });
    await seal('P2', 'Panthers +2.5', { line: { ...BEARS, choice: 'spreadAway', point: 2.5 } });
    expect((await pick('P2'))?.pickText).toBe('Panthers +2.5');
  });
});
