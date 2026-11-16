/**
 * Duplicate picks (added 2026-11-16). Two players may seal the same pick, but
 * the second one is warned first. The warning says only that the pick is
 * taken, never by whom, since picks stay hidden until the vault opens.
 */
import type { PickLine } from './lineMove.js';

export interface PickIdentity {
  pickText: string;
  line?: PickLine;
}

/** Lowercase, unify minus signs, collapse whitespace: "Bears  −2.5 " → "bears -2.5". */
export function normalizePickText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2212\u2012\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True if `a` and `b` are the same pick. Two board picks match on sport, game
 * and side at any line (Bears −2.5 and Bears −3 match), since both are
 * re-priced at vault open. Otherwise the normalized pick text must match.
 */
export function isSamePick(a: PickIdentity, b: PickIdentity): boolean {
  if (a.line && b.line) {
    return a.line.sport === b.line.sport && a.line.eventId === b.line.eventId && a.line.choice === b.line.choice;
  }
  return normalizePickText(a.pickText) === normalizePickText(b.pickText);
}
