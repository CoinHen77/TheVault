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
import { toDatetimeLocal } from './WeekManager';

const startGrading = httpsCallable<{ seasonId: string; weekId: string }, void>(functions, 'startGrading');
const closeWeek = httpsCallable<{ seasonId: string; weekId: string }, unknown>(functions, 'closeWeek');
const openVaultEarly = httpsCallable<{ seasonId: string; weekId: string }, void>(functions, 'openVaultEarly');
const resealVault = httpsCallable<{ seasonId: string; weekId: string; lockAtMs: number }, { deletedBets: number }>(
  functions,
  'resealVault',
);

const STEPS: { status: WeekStatus; label: string }[] = [
  { status: 'open', label: COPY.weekStatus.open },
  { status: 'locked', label: COPY.weekStatus.locked },
  { status: 'grading', label: COPY.weekStatus.grading },
  { status: 'closed', label: COPY.weekStatus.closed },
];

/**
 * The Control room's week progress bar (CLAUDE.md H5): Taking picks → Vault open →
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
  // Opening the vault can't be undone, so the early-open button takes a second tap.
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
                className={`flex flex-col items-center gap-1 whitespace-nowrap text-xs sm:flex-row sm:gap-1.5 sm:text-sm ${
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

      {week.status === 'open' && week.resealedAt && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          Resealed for late picks. Only paid players without a pick can seal one; everyone else&apos;s pick is final.
        </p>
      )}

      {week.status === 'open' && (
        <p className="text-sm text-vault-gold-soft/70">
          The vault opens by itself at <span className="text-vault-gold-soft">{formatTimestampET(week.lockAt)}</span>.
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
            before the lines move. Only games after the opening time above still count.
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
                  ? 'Tap again to open the vault now'
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
            The vault is open: picks are final and the {COPY.bookholder} can place bets. Start grading once the games are final; the Book
            can&apos;t add bets after that.
          </p>
          <PrimaryButton disabled={submitting} onClick={() => void run(startGrading)}>
            {submitting ? 'Starting…' : 'Start grading'}
          </PrimaryButton>
          <ResealVault seasonId={seasonId} weekId={week.id} betCount={bets?.length ?? 0} />
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

/**
 * Admin: put an open vault back to taking picks until a new deadline, so a
 * late player can pay in and seal a pick. Picks already sealed stay final and
 * the Book's bets are deleted (resealVault). Two taps, like opening early.
 */
function ResealVault({ seasonId, weekId, betCount }: { seasonId: string; weekId: string; betCount: number }) {
  const [open, setOpen] = useState(false);
  const [lockAtInput, setLockAtInput] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockAtMs = lockAtInput ? new Date(lockAtInput).getTime() : NaN;
  const valid = Number.isFinite(lockAtMs) && lockAtMs > Date.now();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setLockAtInput(toDatetimeLocal(Date.now() + 60 * 60 * 1000));
          setOpen(true);
        }}
        className="min-h-11 text-sm text-vault-gold-soft/70 underline-offset-2 hover:text-vault-gold-soft hover:underline"
      >
        {COPY.resealVault}
      </button>
    );
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await resealVault({ seasonId, weekId, lockAtMs });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConfirm(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-vault-line bg-vault-black/30 p-3">
      <p className="text-sm text-vault-gold-soft/80">
        Takes picks again until the new deadline, so late players can pay in and seal one. Picks already in stay final and
        are hidden again until the vault reopens.
        {betCount > 0 && (
          <span className="text-amber-400">
            {' '}
            The {betCount} Book bet{betCount === 1 ? '' : 's'} will be deleted; the {COPY.bookholder} places them again
            after.
          </span>
        )}
      </p>
      <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.12em] text-vault-gold-soft/60">
        New deadline
        <input
          type="datetime-local"
          value={lockAtInput}
          onChange={(e) => {
            setLockAtInput(e.target.value);
            setConfirm(false);
          }}
          className="min-h-11 rounded-lg border border-vault-steel-700 bg-vault-black/40 px-3 py-2.5 font-mono text-base normal-case tracking-normal text-vault-gold-soft outline-none focus:border-vault-gold/60"
        />
      </label>
      {!valid && lockAtInput && <p className="text-xs text-vault-loss">The new deadline has to be in the future.</p>}
      {error && <ErrorBanner message={error} />}
      <PrimaryButton disabled={submitting || !valid} onClick={() => (confirm ? void submit() : setConfirm(true))}>
        {submitting ? 'Resealing…' : confirm ? 'Tap again to reseal' : 'Reseal the vault'}
      </PrimaryButton>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setConfirm(false);
        }}
        className="min-h-11 text-sm text-vault-gold-soft/70 hover:text-vault-gold-soft"
      >
        Cancel
      </button>
    </div>
  );
}
