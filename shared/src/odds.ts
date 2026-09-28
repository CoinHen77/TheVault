/** American odds are integers ≤ −100 or ≥ +100 (SPEC.md §2 conventions). */
export function isValidAmericanOdds(odds: number): boolean {
  return Number.isInteger(odds) && (odds <= -100 || odds >= 100);
}

/**
 * Converts American odds to decimal odds.
 * Positive: odds/100 + 1. Negative: 100/|odds| + 1.
 */
export function americanToDecimal(odds: number): number {
  if (!isValidAmericanOdds(odds)) {
    throw new Error(`Invalid American odds: ${odds}. Must be an integer ≤ -100 or ≥ 100.`);
  }
  return odds > 0 ? odds / 100 + 1 : 100 / -odds + 1;
}
