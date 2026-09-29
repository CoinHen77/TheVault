import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { withSeasonDefaults, type Season, type Standing } from '@vault/shared';
import { playerDoc, seasonDoc, standingDoc } from '../paths.js';

export interface UpdatePlayerNameParams {
  uid: string;
  displayName: string;
  /**
   * The active season's id, so its standings/{uid} doc (if the player has
   * one) is kept in sync — Standing.displayName is a denormalized copy taken
   * at first buy-in/preload. Omit if there's no active season yet. Older,
   * already-closed seasons keep whatever name they had at the time, same as
   * any other historical record.
   */
  seasonId?: string;
}

/**
 * Admin edit of another player's display name (Player.displayName is
 * otherwise self-write-only per firestore.rules).
 */
export async function updatePlayerNameLogic(db: Firestore, params: UpdatePlayerNameParams): Promise<void> {
  const displayName = params.displayName.trim();
  if (!displayName) {
    throw new HttpsError('invalid-argument', 'Display name cannot be empty.');
  }

  const playerRef = playerDoc(db, params.uid);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists) {
    throw new HttpsError('not-found', `Player ${params.uid} not found.`);
  }

  const batch = db.batch();
  batch.update(playerRef, { displayName });

  if (params.seasonId) {
    const standingRef = standingDoc(db, params.seasonId, params.uid);
    const standingSnap = await standingRef.get();
    if (standingSnap.exists) {
      batch.update(standingRef, { displayName });
    }
  }

  await batch.commit();
}

export interface RemovePlayerFromSeasonParams {
  seasonId: string;
  playerId: string;
}

function assertNoSeasonFootprint(standing: Standing | undefined, seasonId: string, playerId: string): void {
  if (!standing) return;
  if (standing.shares !== 0 || standing.weeksBoughtIn !== 0 || standing.preloadedCents !== 0) {
    throw new HttpsError(
      'failed-precondition',
      `${playerId} already has shares or a paid buy-in/preload in season ${seasonId} — remove those first.`,
    );
  }
}

/**
 * Excludes a player from this season's buy-in/pick/preload pickers. Only
 * allowed with zero season footprint (see assertNoSeasonFootprint) so this
 * never has to touch the Vault, shares, or standings — it's a roster
 * visibility change, not a money operation.
 */
export async function removePlayerFromSeasonLogic(db: Firestore, params: RemovePlayerFromSeasonParams): Promise<void> {
  const { seasonId, playerId } = params;
  const seasonRef = seasonDoc(db, seasonId);

  await db.runTransaction(async (tx) => {
    const [seasonSnap, standingSnap] = await Promise.all([tx.get(seasonRef), tx.get(standingDoc(db, seasonId, playerId))]);
    if (!seasonSnap.exists) throw new HttpsError('not-found', `Season ${seasonId} not found.`);
    const season = withSeasonDefaults(seasonSnap.data() as Season);

    assertNoSeasonFootprint(standingSnap.data() as Standing | undefined, seasonId, playerId);

    if (season.removedPlayerIds.includes(playerId)) {
      throw new HttpsError('already-exists', `${playerId} is already removed from season ${seasonId}.`);
    }

    tx.update(seasonRef, { removedPlayerIds: FieldValue.arrayUnion(playerId) });
  });
}

export interface RestorePlayerToSeasonParams {
  seasonId: string;
  playerId: string;
}

/** Reverses removePlayerFromSeasonLogic. */
export async function restorePlayerToSeasonLogic(db: Firestore, params: RestorePlayerToSeasonParams): Promise<void> {
  const { seasonId, playerId } = params;
  const seasonRef = seasonDoc(db, seasonId);

  await db.runTransaction(async (tx) => {
    const seasonSnap = await tx.get(seasonRef);
    if (!seasonSnap.exists) throw new HttpsError('not-found', `Season ${seasonId} not found.`);
    const season = withSeasonDefaults(seasonSnap.data() as Season);

    if (!season.removedPlayerIds.includes(playerId)) {
      throw new HttpsError('failed-precondition', `${playerId} is not removed from season ${seasonId}.`);
    }

    tx.update(seasonRef, { removedPlayerIds: FieldValue.arrayRemove(playerId) });
  });
}
