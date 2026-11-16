/**
 * A player's pick history (added 2026-11-16): the numbers behind their player
 * page. Picks come in season order, oldest first; pending picks are skipped
 * for everything but the list itself.
 */
import { americanToDecimal } from './odds.js';
import type { PickResult } from './types.js';

export interface HistoryPick {
  weekId: string;
  americanOdds: number;
  result: PickResult;
  units: number | null;
}

export interface PickHistorySummary {
  /** Running season units after each graded week, for the units-over-time chart. */
  cumulative: { weekId: string; units: number }[];
  /** The longest-odds winner, if any (same "longest odds" as SPEC.md §1.4). */
  bestHit: HistoryPick | null;
  /** The current run of the same result, newest first; null before anything is graded. */
  streak: { result: Exclude<PickResult, 'pending'>; count: number } | null;
}

export function summarizePickHistory(picks: HistoryPick[]): PickHistorySummary {
  const graded = picks.filter((p) => p.result !== 'pending');

  const cumulative: PickHistorySummary['cumulative'] = [];
  let total = 0;
  for (const p of graded) {
    total = Math.round((total + (p.units ?? 0)) * 100) / 100;
    cumulative.push({ weekId: p.weekId, units: total });
  }

  let bestHit: HistoryPick | null = null;
  for (const p of graded) {
    if (p.result === 'win' && (!bestHit || americanToDecimal(p.americanOdds) > americanToDecimal(bestHit.americanOdds))) {
      bestHit = p;
    }
  }

  let streak: PickHistorySummary['streak'] = null;
  const last = graded.at(-1);
  if (last) {
    let count = 0;
    for (let i = graded.length - 1; i >= 0 && graded[i]!.result === last.result; i--) count++;
    streak = { result: last.result as Exclude<PickResult, 'pending'>, count };
  }

  return { cumulative, bestHit, streak };
}
