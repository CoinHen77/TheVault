import { isValidAmericanOdds } from './odds.js';
import type { PickResult } from './types.js';

/**
 * Units earned by a pick, flat 1-unit risk (SPEC.md §1.2).
 * Win, negative odds: 100/|odds|. Win, positive odds: odds/100.
 * Loss: -1.00. Push: 0.
 *
 * Returns full precision; round only for display (2 decimals, per
 * CLAUDE.md conventions).
 */
export function unitsForPick(odds: number, result: Exclude<PickResult, 'pending'>): number {
  if (!isValidAmericanOdds(odds)) {
    throw new Error(`Invalid American odds: ${odds}. Must be an integer ≤ -100 or ≥ 100.`);
  }
  switch (result) {
    case 'win':
      return odds > 0 ? odds / 100 : 100 / -odds;
    case 'loss':
      return -1;
    case 'push':
      return 0;
  }
}
