import type { Season, WeekType } from './types.js';

/** SPEC.md §1.1 buy-in table — the built-in defaults offered when creating a season. */
export const DEFAULT_BUY_IN_CENTS: Record<WeekType, number> = {
  regular: 1000,
  wildcard: 2500,
  divisional: 2500,
  conference: 5000,
  superbowl: 10000,
};

/**
 * Seasons created before per-season buy-in defaults, the preload, or removed
 * players existed don't have `buyInDefaultsCents`, `requiredPreloadCents`, or
 * `removedPlayerIds`. Read every season through this so those older docs
 * behave like new ones: the SPEC.md §1.1 buy-in table, no preload
 * requirement, and nobody removed.
 */
export function withSeasonDefaults<S extends Season>(season: S): S {
  return {
    ...season,
    buyInDefaultsCents: { ...DEFAULT_BUY_IN_CENTS, ...season.buyInDefaultsCents },
    requiredPreloadCents: season.requiredPreloadCents ?? 0,
    removedPlayerIds: season.removedPlayerIds ?? [],
  };
}
