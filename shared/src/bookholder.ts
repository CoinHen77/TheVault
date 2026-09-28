import { americanToDecimal } from './odds.js';
import type { BookDecision, PickResult } from './types.js';

export interface BookholderCandidate {
  playerId: string;
  /** American odds of this player's pick for the week. */
  odds: number;
  result: Exclude<PickResult, 'pending'>;
  /** Cumulative season units, including this week's results. */
  seasonUnits: number;
  /** Weeks bought in this season, including this week. */
  weeksBoughtIn: number;
}

export interface DecideNextBookholderInput {
  currentBookholderId: string;
  /** Every pick from the week that just closed. */
  candidates: BookholderCandidate[];
  /** Injectable random source for the coin-flip tiebreak. Defaults to Math.random. */
  random?: () => number;
}

export interface BookholderDecision extends BookDecision {
  nextBookholderId: string;
}

function longestOdds(pool: BookholderCandidate[]): BookholderCandidate[] {
  const decimals = pool.map((c) => americanToDecimal(c.odds));
  const max = Math.max(...decimals);
  return pool.filter((_, i) => decimals[i] === max);
}

/**
 * Decides who holds the Book next week (SPEC.md §1.4).
 *
 * Rules, first match wins: any win → longest-odds winner; else any push →
 * longest-odds push; else the current Bookholder keeps it. Ties break on
 * most season units, then most weeks bought in, then a server-side coin flip.
 */
export function decideNextBookholder(input: DecideNextBookholderInput): BookholderDecision {
  const { currentBookholderId, candidates, random = Math.random } = input;

  const winners = candidates.filter((c) => c.result === 'win');
  let pool: BookholderCandidate[];
  let rule: 'win' | 'push';
  if (winners.length > 0) {
    pool = winners;
    rule = 'win';
  } else {
    const pushes = candidates.filter((c) => c.result === 'push');
    if (pushes.length > 0) {
      pool = pushes;
      rule = 'push';
    } else {
      return {
        nextBookholderId: currentBookholderId,
        rule: 'all_losses_keep',
        candidates: [],
        tiebreakUsed: 'none',
      };
    }
  }

  const poolIds = pool.map((c) => c.playerId);

  let tied = longestOdds(pool);
  if (tied.length === 1) {
    const winner = tied[0];
    if (!winner) throw new Error('unreachable: tied has length 1');
    return { nextBookholderId: winner.playerId, rule, candidates: poolIds, tiebreakUsed: 'none' };
  }

  const maxUnits = Math.max(...tied.map((c) => c.seasonUnits));
  tied = tied.filter((c) => c.seasonUnits === maxUnits);
  if (tied.length === 1) {
    const winner = tied[0];
    if (!winner) throw new Error('unreachable: tied has length 1');
    return { nextBookholderId: winner.playerId, rule, candidates: poolIds, tiebreakUsed: 'units' };
  }

  const maxWeeks = Math.max(...tied.map((c) => c.weeksBoughtIn));
  tied = tied.filter((c) => c.weeksBoughtIn === maxWeeks);
  if (tied.length === 1) {
    const winner = tied[0];
    if (!winner) throw new Error('unreachable: tied has length 1');
    return { nextBookholderId: winner.playerId, rule, candidates: poolIds, tiebreakUsed: 'weeks' };
  }

  const idx = Math.floor(random() * tied.length);
  const winner = tied[Math.min(idx, tied.length - 1)];
  if (!winner) throw new Error('unreachable: tied is non-empty');
  return {
    nextBookholderId: winner.playerId,
    rule,
    candidates: poolIds,
    tiebreakUsed: 'coin_flip',
    coinFlipResult: winner.playerId,
  };
}
