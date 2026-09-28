import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { sharesForBuyIn, type BuyIn, type Player, type Season, type Standing, type Week } from '@vault/shared';
import { buyInDoc, ledgerCol, pickDoc, playerDoc, seasonDoc, standingDoc, weekDoc } from '../paths.js';

export interface MarkBuyInPaidParams {
  seasonId: string;
  weekId: string;
  playerId: string;
  markedBy: string;
  /** Overrides the week's default buyInCents, e.g. for a manual adjustment. */
  amountCentsOverride?: number;
}

/** SPEC.md §5 markBuyInPaid, run in a transaction (CLAUDE.md money-update rule). */
export async function markBuyInPaidLogic(
  db: Firestore,
  params: MarkBuyInPaidParams,
): Promise<{ sharesIssued: number; amountCents: number }> {
  const { seasonId, weekId, playerId, markedBy, amountCentsOverride } = params;

  const weekRef = weekDoc(db, seasonId, weekId);
  const buyInRef = buyInDoc(db, seasonId, weekId, playerId);
  const seasonRef = seasonDoc(db, seasonId);
  const standingRef = standingDoc(db, seasonId, playerId);
  const playerRef = playerDoc(db, playerId);

  return db.runTransaction(async (tx) => {
    const [weekSnap, buyInSnap, standingSnap, playerSnap] = await Promise.all([
      tx.get(weekRef),
      tx.get(buyInRef),
      tx.get(standingRef),
      tx.get(playerRef),
    ]);

    if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
    const week = weekSnap.data() as Week;
    if (week.status !== 'open') {
      throw new HttpsError('failed-precondition', `Week ${weekId} is ${week.status}, not open.`);
    }

    const existingBuyIn = buyInSnap.data() as BuyIn | undefined;
    if (existingBuyIn?.paid) {
      throw new HttpsError('already-exists', `${playerId}'s buy-in for ${weekId} is already marked paid.`);
    }

    const amountCents = amountCentsOverride ?? week.buyInCents;
    const shares = sharesForBuyIn(amountCents, week.sharePriceAtOpen);
    const now = Timestamp.now();

    const buyIn: BuyIn = {
      amountCents,
      paid: true,
      paidAt: now,
      sharePrice: week.sharePriceAtOpen,
      sharesIssued: shares,
      markedBy,
    };
    tx.set(buyInRef, buyIn);

    tx.update(seasonRef, {
      totalShares: FieldValue.increment(shares),
      vaultCents: FieldValue.increment(amountCents),
    });

    if (standingSnap.exists) {
      tx.update(standingRef, {
        shares: FieldValue.increment(shares),
        weeksBoughtIn: FieldValue.increment(1),
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
        weeksBoughtIn: 1,
        shares,
      };
      tx.set(standingRef, standing);
    }

    tx.set(ledgerCol(db, seasonId).doc(), {
      type: 'buy_in',
      weekId,
      playerId,
      amountCents,
      note: `Buy-in paid for ${weekId}`,
      createdAt: now,
      createdBy: markedBy,
    });

    return { sharesIssued: shares, amountCents };
  });
}

export interface UnmarkBuyInParams {
  seasonId: string;
  weekId: string;
  playerId: string;
  unmarkedBy: string;
}

/** SPEC.md §5 unmarkBuyIn: reverses markBuyInPaid while the week is open, and deletes the pick. */
export async function unmarkBuyInLogic(db: Firestore, params: UnmarkBuyInParams): Promise<void> {
  const { seasonId, weekId, playerId, unmarkedBy } = params;

  const weekRef = weekDoc(db, seasonId, weekId);
  const buyInRef = buyInDoc(db, seasonId, weekId, playerId);
  const seasonRef = seasonDoc(db, seasonId);
  const standingRef = standingDoc(db, seasonId, playerId);
  const pickRef = pickDoc(db, seasonId, weekId, playerId);

  await db.runTransaction(async (tx) => {
    const [weekSnap, buyInSnap] = await Promise.all([tx.get(weekRef), tx.get(buyInRef)]);

    if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
    const week = weekSnap.data() as Week;
    if (week.status !== 'open') {
      throw new HttpsError('failed-precondition', `Week ${weekId} is ${week.status}, not open.`);
    }

    const buyIn = buyInSnap.data() as BuyIn | undefined;
    if (!buyIn?.paid) {
      throw new HttpsError('failed-precondition', `${playerId} has no paid buy-in for ${weekId} to unmark.`);
    }

    tx.update(seasonRef, {
      totalShares: FieldValue.increment(-buyIn.sharesIssued),
      vaultCents: FieldValue.increment(-buyIn.amountCents),
    });
    tx.update(standingRef, {
      shares: FieldValue.increment(-buyIn.sharesIssued),
      weeksBoughtIn: FieldValue.increment(-1),
    });
    tx.delete(buyInRef);
    tx.delete(pickRef);
    tx.update(weekRef, { submittedPlayerIds: FieldValue.arrayRemove(playerId) });

    tx.set(ledgerCol(db, seasonId).doc(), {
      type: 'buy_in',
      weekId,
      playerId,
      amountCents: -buyIn.amountCents,
      note: `Buy-in unmarked for ${weekId}`,
      createdAt: Timestamp.now(),
      createdBy: unmarkedBy,
    });
  });
}
