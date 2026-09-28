import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import type { BookBet, BookDecisionRule, BookDecisionTiebreak, Pick as PickDoc, Player, Week } from '@vault/shared';
import { Card, ErrorBanner } from '../../components/ui';
import { functions } from '../../lib/firebase';
import { formatCents, formatSharePrice } from '../../lib/format';

const startGrading = httpsCallable<{ seasonId: string; weekId: string }, void>(functions, 'startGrading');
const closeWeek = httpsCallable<{ seasonId: string; weekId: string }, unknown>(functions, 'closeWeek');

const RULE_LABEL: Record<BookDecisionRule, string> = {
  win: 'Longest-odds winning pick',
  push: 'No wins — longest-odds push',
  all_losses_keep: 'Everyone lost — Bookholder keeps the Book',
  admin_override: 'Admin override',
};

const TIEBREAK_LABEL: Record<BookDecisionTiebreak, string> = {
  none: 'No tie',
  units: 'Tiebreak: most season units',
  weeks: 'Tiebreak: most weeks bought in',
  coin_flip: 'Tiebreak: coin flip',
};

/** SPEC.md §5 startGrading/closeWeek and §1.4's Book decision, shown once the week closes. */
export default function WeekLifecycleActions({
  seasonId,
  week,
  picks,
  bets,
  players,
}: {
  seasonId: string;
  week: Week & { id: string };
  picks: (PickDoc & { id: string })[] | null;
  bets: (BookBet & { id: string })[] | null;
  players: Record<string, Player>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStartGrading() {
    setSubmitting(true);
    setError(null);
    try {
      await startGrading({ seasonId, weekId: week.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const allGraded =
    week.status === 'grading' &&
    (picks ?? []).every((p) => p.result !== 'pending') &&
    (bets ?? []).every((b) => b.result !== 'pending');

  async function handleClose() {
    setSubmitting(true);
    setError(null);
    try {
      await closeWeek({ seasonId, weekId: week.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (week.status !== 'locked' && week.status !== 'grading' && week.status !== 'closed') {
    return null;
  }

  return (
    <Card title="Week lifecycle">
      {error && <ErrorBanner message={error} />}
      <div className="flex flex-col gap-3">
        {week.status === 'locked' && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleStartGrading()}
            className="rounded-lg bg-vault-gold px-4 py-3 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
          >
            Start grading
          </button>
        )}
        {week.status === 'grading' && (
          <button
            type="button"
            disabled={submitting || !allGraded}
            onClick={() => void handleClose()}
            className="rounded-lg bg-vault-gold px-4 py-3 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
          >
            {allGraded ? 'Close week' : 'Grade every pick and bet to close'}
          </button>
        )}
        {week.status === 'closed' && (
          <div className="rounded-lg border border-vault-green-700/40 bg-vault-black/30 p-3 text-sm">
            <p className="mb-2 font-semibold text-vault-gold">Book decision</p>
            <p className="text-vault-gold-soft/80">{RULE_LABEL[week.bookDecision.rule]}</p>
            {week.bookDecision.tiebreakUsed !== 'none' && (
              <p className="text-xs text-vault-gold-soft/50">{TIEBREAK_LABEL[week.bookDecision.tiebreakUsed]}</p>
            )}
            {week.bookDecision.coinFlipResult && (
              <p className="text-xs text-vault-gold-soft/50">Coin flip result: {week.bookDecision.coinFlipResult}</p>
            )}
            <p className="mt-2 text-vault-gold-soft/80">
              Next Bookholder:{' '}
              <span className="font-medium text-vault-gold-soft">
                {players[week.nextBookholderId]?.displayName ?? week.nextBookholderId}
              </span>
            </p>
            <p className="mt-2 text-xs text-vault-gold-soft/50">
              Closing Vault {formatCents(week.closingVaultCents)} · Share price{' '}
              {formatSharePrice(week.closingSharePrice)}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
