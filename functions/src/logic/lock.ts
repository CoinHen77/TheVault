import { Timestamp, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { bookCapCents, withSeasonDefaults, type Season, type Week } from '@vault/shared';
import { buyInsCol, picksCol, seasonDoc, weekDoc } from '../paths.js';

/**
 * SPEC.md §4 "locked": snapshots openingVaultCents and bookCapCents from the
 * season. lockAt is left alone, so it still marks the eligibility cutoff
 * (§1.1) when the Admin opens the vault early.
 */
function lockWeekInTx(tx: Transaction, weekRef: DocumentReference, season: Season): void {
  const { vaultCents, bookCapPct } = withSeasonDefaults(season);
  tx.update(weekRef, {
    status: 'locked',
    openingVaultCents: vaultCents,
    bookCapCents: bookCapCents(vaultCents, bookCapPct),
  });
}

export interface LockDueWeeksParams {
  /** Injectable for tests; defaults to the real clock. */
  nowMs?: number;
}

/**
 * SPEC.md §5 lockDueWeeks: every 5 minutes, locks open weeks whose lockAt has
 * passed, snapshotting openingVaultCents and bookCapCents from the season.
 * Runs one transaction per due week so a race with another lock pass or a
 * late buy-in can't corrupt the snapshot.
 */
export async function lockDueWeeksLogic(db: Firestore, params: LockDueWeeksParams = {}): Promise<{ lockedWeekIds: string[] }> {
  const nowMs = params.nowMs ?? Date.now();
  const now = Timestamp.fromMillis(nowMs);

  const dueSnap = await db
    .collectionGroup('weeks')
    .where('status', '==', 'open')
    .where('lockAt', '<=', now)
    .get();

  const lockedWeekIds: string[] = [];

  for (const weekSnap of dueSnap.docs) {
    const seasonId = weekSnap.ref.parent.parent?.id;
    if (!seasonId) continue;
    const weekId = weekSnap.id;
    const seasonRef = seasonDoc(db, seasonId);

    await db.runTransaction(async (tx) => {
      const [freshWeekSnap, seasonSnap] = await Promise.all([tx.get(weekSnap.ref), tx.get(seasonRef)]);
      if (!freshWeekSnap.exists || !seasonSnap.exists) return;

      const week = freshWeekSnap.data() as Week;
      if (week.status !== 'open' || week.lockAt.toMillis() > nowMs) return;

      lockWeekInTx(tx, weekSnap.ref, seasonSnap.data() as Season);
    });

    lockedWeekIds.push(weekId);
  }

  return { lockedWeekIds };
}

/**
 * Admin "open the vault early": locks an open week before its lockAt once
 * every paid player has a pick in, so the odds the Book bets at don't drift
 * toward the weekend. Same snapshot as lockDueWeeks.
 */
export async function openVaultEarlyLogic(db: Firestore, params: { seasonId: unknown; weekId: unknown }): Promise<void> {
  const { seasonId, weekId } = params;
  if (typeof seasonId !== 'string' || !seasonId || typeof weekId !== 'string' || !weekId) {
    throw new HttpsError('invalid-argument', 'seasonId and weekId are required.');
  }
  const weekRef = weekDoc(db, seasonId, weekId);

  await db.runTransaction(async (tx) => {
    const [weekSnap, seasonSnap, paidSnap, picksSnap] = await Promise.all([
      tx.get(weekRef),
      tx.get(seasonDoc(db, seasonId)),
      tx.get(buyInsCol(db, seasonId, weekId).where('paid', '==', true)),
      tx.get(picksCol(db, seasonId, weekId)),
    ]);
    if (!weekSnap.exists || !seasonSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
    if ((weekSnap.data() as Week).status !== 'open') {
      throw new HttpsError('failed-precondition', `Week ${weekId} is not open.`);
    }
    if (paidSnap.empty) throw new HttpsError('failed-precondition', 'No one has paid in yet.');

    const picked = new Set(picksSnap.docs.map((d) => d.id));
    const missing = paidSnap.docs.filter((d) => !picked.has(d.id)).length;
    if (missing > 0) {
      throw new HttpsError(
        'failed-precondition',
        `${missing} paid player${missing === 1 ? ' has' : 's have'} not sealed a pick yet.`,
      );
    }

    lockWeekInTx(tx, weekRef, seasonSnap.data() as Season);
  });
}
