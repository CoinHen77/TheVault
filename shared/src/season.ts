import type { WeekType } from './types.js';

/** SPEC.md §1.1 buy-in table — the built-in defaults offered when creating a season. */
export const DEFAULT_BUY_IN_CENTS: Record<WeekType, number> = {
  regular: 1000,
  wildcard: 2500,
  divisional: 2500,
  conference: 5000,
  superbowl: 10000,
};
