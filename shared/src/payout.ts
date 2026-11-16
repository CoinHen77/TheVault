/**
 * Payout tracking (added 2026-11-16): what's been paid in versus what's in the
 * Vault, and what each player would take home if the season ended today
 * (SPEC.md §1.6). This mirrors finalizeSeason, so it moves every week with
 * buy-ins and the Book.
 */
import type { LedgerEntry } from './types.js';

/** Total paid in: buy-ins plus preloads, net of anything unmarked. */
export function paidInCents(entries: Pick<LedgerEntry, 'type' | 'amountCents'>[]): number {
  return entries
    .filter((e) => e.type === 'buy_in' || e.type === 'preload')
    .reduce((sum, e) => sum + e.amountCents, 0);
}

export interface PayoutStanding {
  playerId: string;
  units: number;
  shares: number;
}

export interface ProjectedPayout {
  /** Share of the Group Vault: shares / totalShares × (Vault − Sharp award). */
  groupCents: number;
  /** This player's part of the Sharp award; split evenly while the lead is tied. */
  sharpCents: number;
  totalCents: number;
}

/**
 * Each player's payout if the season ended now. The unit leader gets
 * `sharpPct` of the Vault and the rest is split by shares, as finalizeSeason
 * does. finalizeSeason makes the Admin settle a tie; until then a tied lead
 * splits the award evenly so the totals still add up to the Vault.
 */
export function projectedPayouts(
  standings: PayoutStanding[],
  vaultCents: number,
  totalShares: number,
  sharpPct: number,
): Record<string, ProjectedPayout> {
  const out: Record<string, ProjectedPayout> = {};
  if (standings.length === 0) return out;

  const sharpAwardCents = Math.round(vaultCents * sharpPct);
  const groupVaultCents = vaultCents - sharpAwardCents;
  const maxUnits = Math.max(...standings.map((s) => s.units));
  const leaders = standings.filter((s) => s.units === maxUnits);

  for (const s of standings) {
    const groupCents = totalShares > 0 ? Math.round((s.shares / totalShares) * groupVaultCents) : 0;
    const sharpCents = s.units === maxUnits ? Math.round(sharpAwardCents / leaders.length) : 0;
    out[s.playerId] = { groupCents, sharpCents, totalCents: groupCents + sharpCents };
  }
  return out;
}
