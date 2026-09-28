import type { BookBet, BuyIn, Pick, Standing, Week } from '@vault/shared';
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
