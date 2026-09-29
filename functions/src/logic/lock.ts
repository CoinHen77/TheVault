import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { bookCapCents, withSeasonDefaults, type Season, type Week } from '@vault/shared';
import { seasonDoc } from '../paths.js';

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

      const season = withSeasonDefaults(seasonSnap.data() as Season);
      const openingVaultCents = season.vaultCents;
      const capCents = bookCapCents(openingVaultCents, season.bookCapPct);

      tx.update(weekSnap.ref, {
        status: 'locked',
        openingVaultCents,
        bookCapCents: capCents,
      });
    });

    lockedWeekIds.push(weekId);
  }

  return { lockedWeekIds };
}
