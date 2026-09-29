import type { Week, WeekType } from '@vault/shared';

export { DEFAULT_BUY_IN_CENTS } from '@vault/shared';

export const WEEK_TYPE_OPTIONS: WeekType[] = ['regular', 'wildcard', 'divisional', 'conference', 'superbowl'];

/**
 * Suggests the next week's id/type/nflWeek/buy-in/lockAt from the current
 * week, for pre-filling the Admin's manual "create week" form (SPEC.md §4:
 * closeWeek already auto-creates this most of the time — this manual form is
 * the fallback/override path). The Admin can edit every field before saving.
 * Mirrors `computeNextWeekPlan` in functions/src/logic/season.ts.
 * `buyInDefaults` should be the season's own `buyInDefaultsCents`, so this
 * suggestion matches what closeWeek would actually use.
 */
export function suggestNextWeek(
  current: Week & { id: string },
  buyInDefaults: Record<WeekType, number>,
): {
  weekId: string;
  nflWeek: number | null;
  type: WeekType;
  order: number;
  buyInCents: number;
  lockAtMs: number;
} {
  const lockAtMs = current.lockAt.toMillis() + 7 * 24 * 60 * 60 * 1000;
  const order = current.order + 1;

  if (current.type === 'regular') {
    const nflWeek = (current.nflWeek ?? 3) + 1;
    if (nflWeek <= 18) {
      return { weekId: `W${String(nflWeek).padStart(2, '0')}`, nflWeek, type: 'regular', order, buyInCents: buyInDefaults.regular, lockAtMs };
    }
    return { weekId: 'WC', nflWeek: null, type: 'wildcard', order, buyInCents: buyInDefaults.wildcard, lockAtMs };
  }

  const progression: Partial<Record<WeekType, { weekId: string; type: WeekType }>> = {
    wildcard: { weekId: 'DIV', type: 'divisional' },
    divisional: { weekId: 'CONF', type: 'conference' },
    conference: { weekId: 'SB', type: 'superbowl' },
  };
  const next = progression[current.type];
  if (!next) return { weekId: '', nflWeek: null, type: 'superbowl', order, buyInCents: buyInDefaults.superbowl, lockAtMs };
  return { weekId: next.weekId, nflWeek: null, type: next.type, order, buyInCents: buyInDefaults[next.type], lockAtMs };
}
