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
 * Seasons created before per-season buy-in defaults and the preload existed
 * don't have `buyInDefaultsCents` or `requiredPreloadCents`. Read every season
 * through this so those older docs behave like new ones: the SPEC.md §1.1
 * buy-in table and no preload requirement.
 */
export function withSeasonDefaults<S extends Season>(season: S): S {
  return {
    ...season,
    buyInDefaultsCents: { ...DEFAULT_BUY_IN_CENTS, ...season.buyInDefaultsCents },
    requiredPreloadCents: season.requiredPreloadCents ?? 0,
  };
}
