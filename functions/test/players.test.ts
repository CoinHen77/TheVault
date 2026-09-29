import { beforeEach, describe, expect, it } from 'vitest';
import type { Player, Season, Standing } from '@vault/shared';
import { markBuyInPaidLogic } from '../src/logic/buyIns.js';
import { removePlayerFromSeasonLogic, restorePlayerToSeasonLogic, updatePlayerNameLogic } from '../src/logic/players.js';
import { createSeasonLogic } from '../src/logic/season.js';
import { playerDoc, seasonDoc, standingDoc } from '../src/paths.js';
import { clearFirestore, db } from './helpers/emulator.js';
import { seedPlayers } from './helpers/seed.js';

describe('updatePlayerName', () => {
  const SEASON_ID = 'players-season';

  beforeEach(async () => {
    await clearFirestore();
    await seedPlayers(['P1', 'P2']);
  });

  it('updates the player doc', async () => {
    await updatePlayerNameLogic(db, { uid: 'P1', displayName: 'Zach' });
    const snap = await playerDoc(db, 'P1').get();
    expect((snap.data() as Player).displayName).toBe('Zach');
  });

  it('also syncs the active season standings doc, if one exists', async () => {
    await createSeasonLogic(db, { seasonId: SEASON_ID, name: 'Test', adminUid: 'P1', week4LockAtMs: Date.now() + 60_000 });
    await markBuyInPaidLogic(db, { seasonId: SEASON_ID, weekId: 'W04', playerId: 'P1', markedBy: 'admin' });

    await updatePlayerNameLogic(db, { uid: 'P1', displayName: 'Zach', seasonId: SEASON_ID });

    const standing = (await standingDoc(db, SEASON_ID, 'P1').get()).data() as Standing;
    expect(standing.displayName).toBe('Zach');
  });

  it('rejects a blank name', async () => {
    await expect(updatePlayerNameLogic(db, { uid: 'P1', displayName: '   ' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('rejects an unknown uid', async () => {
    await expect(updatePlayerNameLogic(db, { uid: 'ghost', displayName: 'Nobody' })).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('removePlayerFromSeason / restorePlayerToSeason', () => {
  const SEASON_ID = 'players-season';

  beforeEach(async () => {
    await clearFirestore();
    await seedPlayers(['P1', 'P2']);
    await createSeasonLogic(db, { seasonId: SEASON_ID, name: 'Test', adminUid: 'P1', week4LockAtMs: Date.now() + 60_000 });
  });

  it('removes a player who has never bought in or preloaded', async () => {
    await removePlayerFromSeasonLogic(db, { seasonId: SEASON_ID, playerId: 'P2' });
    const season = (await seasonDoc(db, SEASON_ID).get()).data() as Season;
    expect(season.removedPlayerIds).toEqual(['P2']);
  });

  it('blocks removal once the player has a paid buy-in this season', async () => {
    await markBuyInPaidLogic(db, { seasonId: SEASON_ID, weekId: 'W04', playerId: 'P2', markedBy: 'admin' });

    await expect(removePlayerFromSeasonLogic(db, { seasonId: SEASON_ID, playerId: 'P2' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects removing someone already removed', async () => {
    await removePlayerFromSeasonLogic(db, { seasonId: SEASON_ID, playerId: 'P2' });
    await expect(removePlayerFromSeasonLogic(db, { seasonId: SEASON_ID, playerId: 'P2' })).rejects.toMatchObject({
      code: 'already-exists',
    });
  });

  it('restores a removed player', async () => {
    await removePlayerFromSeasonLogic(db, { seasonId: SEASON_ID, playerId: 'P2' });
    await restorePlayerToSeasonLogic(db, { seasonId: SEASON_ID, playerId: 'P2' });
    const season = (await seasonDoc(db, SEASON_ID).get()).data() as Season;
    expect(season.removedPlayerIds).toEqual([]);
  });

  it('rejects restoring someone who was never removed', async () => {
    await expect(restorePlayerToSeasonLogic(db, { seasonId: SEASON_ID, playerId: 'P2' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});
