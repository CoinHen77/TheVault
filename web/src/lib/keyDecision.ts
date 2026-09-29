import type { BookDecision, Player } from '@vault/shared';

const TIEBREAK_TEXT: Record<BookDecision['tiebreakUsed'], string> = {
  none: '',
  units: 'Tie broken on season units.',
  weeks: 'Tie broken on weeks bought in.',
  coin_flip: 'Tie broken by a coin flip.',
};

/**
 * Plain-English "why" for who got the key (next week's Book), from the
 * `bookDecision` audit written at close (SPEC.md §1.4).
 */
export function keyDecisionReason(decision: BookDecision, players: Record<string, Player>): string {
  const base =
    decision.rule === 'win'
      ? 'Longest-odds winning pick.'
      : decision.rule === 'push'
        ? 'No wins, so the longest-odds push.'
        : decision.rule === 'all_losses_keep'
          ? 'Every pick lost, so the key holder keeps it.'
          : 'Set in the Control room.';

  const tiebreak = TIEBREAK_TEXT[decision.tiebreakUsed];
  if (decision.tiebreakUsed === 'coin_flip' && decision.candidates.length > 1) {
    const names = decision.candidates.map((id) => players[id]?.displayName ?? id).join(', ');
    return `${base} ${tiebreak} (${names})`;
  }
  return tiebreak ? `${base} ${tiebreak}` : base;
}
