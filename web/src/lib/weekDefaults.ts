import type { Week, WeekType } from '@vault/shared';

/**
 * SPEC.md §1.1 buy-in table, mirrored here as form defaults only (the
 * server-side source of truth is `functions/src/logic/season.ts`
 * `DEFAULT_BUY_IN_CENTS` — this copy never runs business logic, it just
 * pre-fills the Admin's "create week" form, which the Admin can edit before
 * submitting).
 */
export const DEFAULT_BUY_IN_CENTS: Record<WeekType, number> = {
  regular: 1000,
  wildcard: 2500,
  divisional: 2500,
  conference: 5000,
  superbowl: 10000,
};

export const WEEK_TYPE_OPTIONS: WeekType[] = ['regular', 'wildcard', 'divisional', 'conference', 'superbowl'];

/**
 * Suggests the next week's id/type/nflWeek/buy-in/lockAt from the current
 * week, for pre-filling the Admin's manual "create week" form (SPEC.md §4:
 * closeWeek already auto-creates this most of the time — this manual form is
 * the fallback/override path). The Admin can edit every field before saving.
 */
export function suggestNextWeek(current: Week & { id: string }): {
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
      return { weekId: `W${String(nflWeek).padStart(2, '0')}`, nflWeek, type: 'regular', order, buyInCents: DEFAULT_BUY_IN_CENTS.regular, lockAtMs };
    }
    return { weekId: 'WC', nflWeek: null, type: 'wildcard', order, buyInCents: DEFAULT_BUY_IN_CENTS.wildcard, lockAtMs };
  }

  const progression: Partial<Record<WeekType, { weekId: string; type: WeekType }>> = {
    wildcard: { weekId: 'DIV', type: 'divisional' },
    divisional: { weekId: 'CONF', type: 'conference' },
    conference: { weekId: 'SB', type: 'superbowl' },
  };
  const next = progression[current.type];
  if (!next) return { weekId: '', nflWeek: null, type: 'superbowl', order, buyInCents: DEFAULT_BUY_IN_CENTS.superbowl, lockAtMs };
  return { weekId: next.weekId, nflWeek: null, type: next.type, order, buyInCents: DEFAULT_BUY_IN_CENTS[next.type], lockAtMs };
}
