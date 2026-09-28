import { americanToDecimal } from './odds.js';
import type { PickResult } from './types.js';

/**
 * Book cap (SPEC.md §1.3, §5 lockDueWeeks): floor(Opening Vault × cap %).
 */
export function bookCapCents(openingVaultCents: number, bookCapPct: number): number {
  return Math.floor(openingVaultCents * bookCapPct);
}

/**
 * Default payout on a win: stake × decimal(ticket odds) (SPEC.md §1.3).
 * Rounded to the nearest cent.
 */
export function defaultBookPayoutCents(stakeCents: number, ticketOdds: number): number {
  return Math.round(stakeCents * americanToDecimal(ticketOdds));
}

export interface BookBetNetInput {
  stakeCents: number;
  ticketOdds: number;
  result: Exclude<PickResult, 'pending'>;
  /** Exact payout from the ticket, overriding the computed default (SPEC.md §1.3). */
  payoutCentsOverride?: number;
}

/**
 * Net Vault effect of a settled book bet (SPEC.md §1.3):
 * win → payout − stake, loss → −stake, push/void → 0.
 */
export function bookBetNetCents(input: BookBetNetInput): number {
  const { stakeCents, ticketOdds, result, payoutCentsOverride } = input;
  switch (result) {
    case 'win': {
      const payoutCents = payoutCentsOverride ?? defaultBookPayoutCents(stakeCents, ticketOdds);
      return payoutCents - stakeCents;
    }
    case 'loss':
      return -stakeCents;
    case 'push':
      return 0;
  }
}
