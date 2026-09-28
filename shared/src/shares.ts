/** Rounds a number to 6 decimal places (SPEC.md §2 share convention). */
export function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Shares issued for a buy-in (SPEC.md §1.5): amount / share price, using the
 * closing share price of the previous closed week (or $1.00 for week one).
 * Rounded to 6 decimals.
 */
export function sharesForBuyIn(amountCents: number, sharePriceAtOpen: number): number {
  if (sharePriceAtOpen <= 0) {
    throw new Error(`Invalid share price: ${sharePriceAtOpen}. Must be positive.`);
  }
  return round6(amountCents / 100 / sharePriceAtOpen);
}

/**
 * Share price (SPEC.md §1.5): closing Vault / total shares outstanding.
 * Full precision; display rounds to 2 decimals.
 */
export function sharePrice(vaultCents: number, totalShares: number): number {
  if (totalShares <= 0) {
    throw new Error(`Invalid total shares: ${totalShares}. Must be positive.`);
  }
  return vaultCents / 100 / totalShares;
}
