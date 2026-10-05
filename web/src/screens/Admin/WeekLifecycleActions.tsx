import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import type { BookBet, Pick as PickDoc, Player, Week, WeekStatus } from '@vault/shared';
import Icon from '../../components/Icon';
import { ErrorBanner } from '../../components/ui';
import { useBuyIns } from '../../hooks/useWeekData';
import { COPY } from '../../lib/copy';
import { functions } from '../../lib/firebase';
import { formatCents, formatSharePrice, formatTimestampET, weekLabel } from '../../lib/format';
import { keyDecisionReason } from '../../lib/keyDecision';

const startGrading = httpsCallable<{ seasonId: string; weekId: string }, void>(functions, 'startGrading');
const closeWeek = httpsCallable<{ seasonId: string; weekId: string }, unknown>(functions, 'closeWeek');
const openVaultEarly = httpsCallable<{ seasonId: string; weekId: string }, void>(functions, 'openVaultEarly');

const STEPS: { status: WeekStatus; label: string }[] = [
  { status: 'open', label: 'Open' },
  { status: 'locked', label: 'Locked' },
  { status: 'grading', label: 'Grading' },
  { status: 'closed', label: 'Closed' },
];

/**
 * The Control room's week progress bar (CLAUDE.md H5): Open → Locked →
 * Grading → Closed, with the next action as the one primary button.
 * SPEC.md §5 startGrading / closeWeek; §1.4's key decision once closed.
 * While open, the vault can be opened early once every paid player has a
 * pick in (openVaultEarly), so the Book bets before the lines move.
 */
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

  const currentIndex = STEPS.findIndex((s) => s.status === week.status);
  const toGrade = [...(picks ?? []), ...(bets ?? [])];
  const gradedCount = toGrade.filter((x) => x.result !== 'pending').length;
  const allGraded = week.status === 'grading' && gradedCount === toGrade.length;

  const { data: buyIns } = useBuyIns(seasonId, week.id);
  const paidIds = (buyIns ?? []).filter((b) => b.paid).map((b) => b.id);
  const pickedIds = new Set((picks ?? []).map((p) => p.id));
  const sealedCount = paidIds.filter((uid) => pickedIds.has(uid)).length;
  const canOpenEarly = paidIds.length > 0 && sealedCount === paidIds.length;
  // Locking can't be undone, so the early-open button takes a second tap.
  const [confirmEarly, setConfirmEarly] = useState(false);

  async function run(action: typeof startGrading | typeof closeWeek | typeof openVaultEarly) {
    setSubmitting(true);
    setError(null);
    try {
      await action({ seasonId, weekId: week.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-vault-brass bg-vault-panel p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">
        {weekLabel(week)} progress
      </h2>

      <ol className="flex items-center" aria-label="Week progress">
        {STEPS.map((step, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <li key={step.status} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
              <span
                aria-current={current ? 'step' : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm ${
                  done ? 'text-vault-win' : current ? 'font-medium text-vault-gold' : 'text-vault-gold-soft/45'
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                    done
                      ? 'border-vault-win bg-vault-win/15'
                      : current
                        ? 'border-vault-gold bg-vault-gold/15'
                        : 'border-vault-steel-700'
                  }`}
                  aria-hidden="true"
                >
                  {done ? <Icon name="check" className="h-3.5 w-3.5" /> : <span className="font-mono text-[11px]">{i + 1}</span>}
                </span>
                {step.label}
              </span>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`mx-1.5 h-px flex-1 sm:mx-2.5 ${done ? 'bg-vault-win' : 'border-t border-dashed border-vault-steel-700'}`}
                />
              )}
            </li>
          );
        })}
      </ol>

      {error && <ErrorBanner message={error} />}

      {week.status === 'open' && (
        <p className="text-sm text-vault-gold-soft/70">
          The door locks by itself at <span className="text-vault-gold-soft">{formatTimestampET(week.lockAt)}</span>.
          Mark buy-ins and enter any offline picks before then.
        </p>
      )}

      {week.status === 'open' && (
        <>
          <p className="text-sm text-vault-gold-soft/70">
            <span className="font-mono text-vault-gold-soft">
              {sealedCount} of {paidIds.length}
            </span>{' '}
            paid players have sealed a pick. Once everyone has, you can open the vault now so the {COPY.bookholder} bets
            before the lines move. Only games after the lock time above still count.
          </p>
          <PrimaryButton
            disabled={submitting || !canOpenEarly}
            onClick={() => (confirmEarly ? void run(openVaultEarly) : setConfirmEarly(true))}
          >
            {submitting
              ? 'Opening…'
              : !canOpenEarly
                ? 'Waiting on picks to open early'
                : confirmEarly
                  ? 'Tap again to lock picks now'
                  : COPY.openVaultEarly}
          </PrimaryButton>
          {confirmEarly && !submitting && (
            <button
              type="button"
              onClick={() => setConfirmEarly(false)}
              className="min-h-11 text-sm text-vault-gold-soft/70 hover:text-vault-gold-soft"
            >
              Cancel
            </button>
          )}
        </>
      )}

      {week.status === 'locked' && (
        <>
          <p className="text-sm text-vault-gold-soft/70">
            Picks are locked and the {COPY.bookholder} can place bets. Start grading once the games are final; the Book
            can&apos;t add bets after that.
          </p>
          <PrimaryButton disabled={submitting} onClick={() => void run(startGrading)}>
            {submitting ? 'Starting…' : 'Start grading'}
          </PrimaryButton>
        </>
      )}

      {week.status === 'grading' && (
        <>
          <p className="text-sm text-vault-gold-soft/70">
            <span className="font-mono text-vault-gold-soft">
              {gradedCount} of {toGrade.length}
            </span>{' '}
            picks and bets graded.
          </p>
          <PrimaryButton disabled={submitting || !allGraded} onClick={() => void run(closeWeek)}>
            {submitting ? 'Closing…' : allGraded ? 'Close week' : 'Grade everything to close'}
          </PrimaryButton>
        </>
      )}

      {week.status === 'closed' && (
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="flex items-center gap-1.5 text-vault-gold">
            <Icon name="key" className="h-4 w-4" />
            {COPY.keyGoesTo} {players[week.nextBookholderId]?.displayName ?? week.nextBookholderId}
          </p>
          <p className="text-xs text-vault-gold-soft/65">{keyDecisionReason(week.bookDecision, players)}</p>
          {week.bookDecision.coinFlipResult && (
            <p className="text-xs text-vault-gold-soft/65">
              Coin flip went to {players[week.bookDecision.coinFlipResult]?.displayName ?? week.bookDecision.coinFlipResult}.
            </p>
          )}
          <p className="text-xs text-vault-gold-soft/65">
            Closing Vault <span className="font-mono">{formatCents(week.closingVaultCents)}</span> · Share price{' '}
            <span className="font-mono">{formatSharePrice(week.closingSharePrice)}</span>
          </p>
        </div>
      )}
    </section>
  );
}

function PrimaryButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 rounded-lg bg-vault-gold px-4 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
    >
      {children}
    </button>
  );
}
