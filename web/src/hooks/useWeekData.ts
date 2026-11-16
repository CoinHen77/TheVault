import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { BookBet, BuyIn, LedgerEntry, Pick, Preload, Standing, Week } from '@vault/shared';
import { db } from '../lib/firebase';
import { useCollectionData } from './useCollectionData';
import { useDocData } from './useDocData';

export function useMyBuyIn(seasonId: string | null, weekId: string | null, uid: string | null) {
  const path = seasonId && weekId && uid ? `seasons/${seasonId}/weeks/${weekId}/buyIns/${uid}` : null;
  return useDocData<BuyIn>(path);
}

export function useMyPick(seasonId: string | null, weekId: string | null, uid: string | null) {
  const path = seasonId && weekId && uid ? `seasons/${seasonId}/weeks/${weekId}/picks/${uid}` : null;
  return useDocData<Pick>(path);
}

/** buyIns are readable to any signed-in player at all times (SPEC.md §6). */
export function useBuyIns(seasonId: string | null, weekId: string | null) {
  const path = seasonId && weekId ? `seasons/${seasonId}/weeks/${weekId}/buyIns` : null;
  return useCollectionData<BuyIn>(path);
}

/** Season-scoped preload records (not tied to a week), readable to any signed-in player at all times. */
export function usePreloads(seasonId: string | null) {
  const path = seasonId ? `seasons/${seasonId}/preloads` : null;
  return useCollectionData<Preload>(path);
}

/** All weeks in the season, oldest first — used by the Admin screen's week picker. */
export function useWeeks(seasonId: string | null) {
  const path = seasonId ? `seasons/${seasonId}/weeks` : null;
  const { data, loading } = useCollectionData<Week>(path);
  const sorted = data ? [...data].sort((a, b) => a.order - b.order) : null;
  return { data: sorted, loading };
}

export function useStandings(seasonId: string | null) {
  const path = seasonId ? `seasons/${seasonId}/standings` : null;
  const { data, loading } = useCollectionData<Standing>(path);
  const sorted = data ? [...data].sort((a, b) => b.units - a.units) : null;
  return { data: sorted, loading };
}

/**
 * All picks for the week. The picks rule only allows this collection-wide
 * read once the week is no longer `open` (or for an admin) — pass `enabled`
 * accordingly, or the whole query is denied (SPEC.md §6).
 */
export function usePicks(seasonId: string | null, weekId: string | null, enabled: boolean) {
  const path = seasonId && weekId ? `seasons/${seasonId}/weeks/${weekId}/picks` : null;
  return useCollectionData<Pick>(path, enabled);
}

/** bookBets are readable once the week is no longer `open` (SPEC.md §6). */
export function useBookBets(seasonId: string | null, weekId: string | null, enabled: boolean) {
  const path = seasonId && weekId ? `seasons/${seasonId}/weeks/${weekId}/bookBets` : null;
  return useCollectionData<BookBet>(path, enabled);
}

/** The season ledger, readable to any signed-in player (SPEC.md §6). Used for the paid-in total. */
export function useLedger(seasonId: string | null) {
  const path = seasonId ? `seasons/${seasonId}/ledger` : null;
  return useCollectionData<LedgerEntry>(path);
}

/**
 * One player's pick and the Book's legs for each of the given weeks, keyed by
 * week id. Only pass weeks whose picks the viewer may read (SPEC.md §6): any
 * week past `open`, or the viewer's own pick in the open week.
 */
export function usePlayerWeekPicks(seasonId: string | null, weekIds: string[], uid: string | null) {
  const [picks, setPicks] = useState<Record<string, Pick | null>>({});
  const [legs, setLegs] = useState<Record<string, string[]>>({});
  const key = weekIds.join(',');

  useEffect(() => {
    setPicks({});
    setLegs({});
    if (!seasonId || !uid || !key) return;
    const unsubs = key.split(',').flatMap((weekId) => [
      onSnapshot(
        doc(db, `seasons/${seasonId}/weeks/${weekId}/picks/${uid}`),
        (snap) => setPicks((prev) => ({ ...prev, [weekId]: snap.exists() ? (snap.data() as Pick) : null })),
        () => setPicks((prev) => ({ ...prev, [weekId]: null })),
      ),
      onSnapshot(
        collection(db, `seasons/${seasonId}/weeks/${weekId}/bookBets`),
        (snap) => setLegs((prev) => ({ ...prev, [weekId]: snap.docs.flatMap((d) => (d.data() as BookBet).legPickIds) })),
        () => setLegs((prev) => ({ ...prev, [weekId]: [] })),
      ),
    ]);
    return () => unsubs.forEach((u) => u());
  }, [seasonId, key, uid]);

  const loading = key !== '' && key.split(',').some((id) => !(id in picks));
  return { picks, legs, loading };
}
