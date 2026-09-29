import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { sharesForBuyIn, type Player, type Preload, type Season, type Standing } from '@vault/shared';
import { ledgerCol, playerDoc, preloadDoc, seasonDoc, standingDoc } from '../paths.js';

export interface MarkPreloadPaidParams {
  seasonId: string;
  playerId: string;
  markedBy: string;
  /** Overrides the season's requiredPreloadCents, e.g. for a player preloading more than the minimum. */
  amountCentsOverride?: number;
}

/**
 * Admin-only, mirrors markBuyInPaid but season-scoped (not tied to a week):
 * a one-time deposit that gates markBuyInPaid via Season.requiredPreloadCents.
 * Issues shares immediately at the season's current share price (unbacked-cash
 * option was considered and rejected — every dollar in the Vault is owned by
 * someone's shares).
 */
export async function markPreloadPaidLogic(
  db: Firestore,
  params: MarkPreloadPaidParams,
): Promise<{ sharesIssued: number; amountCents: number }> {
  const { seasonId, playerId, markedBy, amountCentsOverride } = params;

  const seasonRef = seasonDoc(db, seasonId);
  const preloadRef = preloadDoc(db, seasonId, playerId);
  const standingRef = standingDoc(db, seasonId, playerId);
  const playerRef = playerDoc(db, playerId);

  return db.runTransaction(async (tx) => {
    const [seasonSnap, preloadSnap, standingSnap, playerSnap] = await Promise.all([
      tx.get(seasonRef),
      tx.get(preloadRef),
      tx.get(standingRef),
      tx.get(playerRef),
    ]);

    if (!seasonSnap.exists) throw new HttpsError('not-found', `Season ${seasonId} not found.`);
    const season = seasonSnap.data() as Season;

    const existingPreload = preloadSnap.data() as Preload | undefined;
    if (existingPreload?.paid) {
      throw new HttpsError('already-exists', `${playerId}'s preload is already marked paid.`);
    }

    const amountCents = amountCentsOverride ?? season.requiredPreloadCents;
    if (amountCents <= 0) {
      throw new HttpsError('invalid-argument', 'Preload amount must be positive.');
    }
    const shares = sharesForBuyIn(amountCents, season.sharePrice);
    const now = Timestamp.now();

    const preload: Preload = {
      amountCents,
      paid: true,
      paidAt: now,
      sharePrice: season.sharePrice,
      sharesIssued: shares,
      markedBy,
    };
    tx.set(preloadRef, preload);

    tx.update(seasonRef, {
      totalShares: FieldValue.increment(shares),
      vaultCents: FieldValue.increment(amountCents),
    });

    if (standingSnap.exists) {
      tx.update(standingRef, {
        shares: FieldValue.increment(shares),
        preloadedCents: FieldValue.increment(amountCents),
      });
    } else {
      const player = playerSnap.data() as Player | undefined;
      const standing: Standing = {
        playerId,
        displayName: player?.displayName ?? playerId,
        wins: 0,
        losses: 0,
        pushes: 0,
        units: 0,
        weeksBoughtIn: 0,
        shares,
        preloadedCents: amountCents,
      };
      tx.set(standingRef, standing);
    }

    tx.set(ledgerCol(db, seasonId).doc(), {
      type: 'preload',
      weekId: null,
      playerId,
      amountCents,
      note: 'Preload paid',
      createdAt: now,
      createdBy: markedBy,
    });

    return { sharesIssued: shares, amountCents };
  });
}

export interface UnmarkPreloadParams {
  seasonId: string;
  playerId: string;
  unmarkedBy: string;
}

/** Reverses markPreloadPaid — mirrors unmarkBuyIn. */
export async function unmarkPreloadLogic(db: Firestore, params: UnmarkPreloadParams): Promise<void> {
  const { seasonId, playerId, unmarkedBy } = params;

  const seasonRef = seasonDoc(db, seasonId);
  const preloadRef = preloadDoc(db, seasonId, playerId);
  const standingRef = standingDoc(db, seasonId, playerId);

  await db.runTransaction(async (tx) => {
    const preloadSnap = await tx.get(preloadRef);
    const preload = preloadSnap.data() as Preload | undefined;
    if (!preload?.paid) {
      throw new HttpsError('failed-precondition', `${playerId} has no paid preload to unmark.`);
    }

    tx.update(seasonRef, {
      totalShares: FieldValue.increment(-preload.sharesIssued),
      vaultCents: FieldValue.increment(-preload.amountCents),
    });
    tx.update(standingRef, {
      shares: FieldValue.increment(-preload.sharesIssued),
      preloadedCents: FieldValue.increment(-preload.amountCents),
    });
    tx.delete(preloadRef);

    tx.set(ledgerCol(db, seasonId).doc(), {
      type: 'preload',
      weekId: null,
      playerId,
      amountCents: -preload.amountCents,
      note: 'Preload unmarked',
      createdAt: Timestamp.now(),
      createdBy: unmarkedBy,
    });
  });
}
