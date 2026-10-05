import { httpsCallable } from 'firebase/functions';
import { useMemo, useState } from 'react';
import { defaultBookPayoutCents, isValidAmericanOdds } from '@vault/shared';
import { useAuth } from '../auth/AuthProvider';
import CapRing from '../components/heist/CapRing';
import Door from '../components/heist/Door';
import KeyBadge from '../components/heist/KeyBadge';
import { ResultStamp } from '../components/heist/Seals';
import Ticket, { TicketStat } from '../components/heist/Ticket';
import { EmptyState, ErrorBanner } from '../components/ui';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useBookBets, usePicks } from '../hooks/useWeekData';
import { functions } from '../lib/firebase';
import { COPY } from '../lib/copy';
import { formatCents, formatOdds, parseOddsInput, weekLabel } from '../lib/format';

const placeBookBet = httpsCallable<
  {
    seasonId: string;
    weekId: string;
    legPickIds: string[];
    stakeCents: number;
    ticketOdds: number;
    payoutCentsOverride?: number;
  },
  { betId: string }
>(functions, 'placeBookBet');

export default function Book() {
  const { user } = useAuth();
  const { season, week, players } = useVaultData();
  const picksEnabled = Boolean(week) && week!.status !== 'open';
  const { data: picks } = usePicks(season?.id ?? null, week?.id ?? null, picksEnabled);
  const { data: bets } = useBookBets(season?.id ?? null, week?.id ?? null, picksEnabled);

  if (!season || !week) {
    return <EmptyState>No active season yet.</EmptyState>;
  }

  const stakedCents = (bets ?? []).reduce((sum, b) => sum + b.stakeCents, 0);
  const capRemainingCents = week.bookCapCents - stakedCents;
  const isBookholder = user?.uid === week.bookholderId;
  const canPlaceBets = isBookholder && week.status === 'locked';
  const holderName = isBookholder ? 'You' : (players[week.bookholderId]?.displayName ?? week.bookholderId);
  const legName = (id: string) => {
    const leg = picks?.find((p) => p.id === id);
    return leg ? leg.pickText : (players[id]?.displayName ?? id);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-vault-gold">{COPY.bookTitle}</h1>
          <p className="text-sm text-vault-gold-soft/60">{weekLabel(week)}</p>
        </div>
        <KeyBadge name={holderName} />
      </header>

      {week.status === 'open' ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Door state="closed" height={140} />
          <p className="text-sm text-vault-gold-soft/70">The {COPY.bookholder} places bets once the vault opens.</p>
          <p className="text-xs text-vault-gold-soft/55">
            Then the {COPY.bookholder} can stake up to {Math.round(season.bookCapPct * 100)}% of the opening Vault on
            this week&apos;s picks.
          </p>
        </div>
      ) : (
        <CapRing usedCents={stakedCents} capCents={week.bookCapCents} />
      )}

      {canPlaceBets && picks && (
        <BetBuilder
          seasonId={season.id}
          weekId={week.id}
          picks={picks}
          players={players}
          capRemainingCents={capRemainingCents}
        />
      )}

      {week.status !== 'open' && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">Placed</h2>
          {!bets || bets.length === 0 ? (
            <EmptyState>No bets placed yet.</EmptyState>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {bets.map((bet) => (
                <li key={bet.id}>
                  <Ticket
                    eyebrow={bet.legPickIds.length === 1 ? 'Straight' : `${bet.legPickIds.length}-leg parlay`}
                    title={<span className="font-mono">{formatOdds(bet.ticketOdds)}</span>}
                    subtitle={bet.legPickIds.map(legName).join(' · ')}
                    muted={bet.result === 'loss' || bet.result === 'push'}
                    mark={<ResultStamp result={bet.result} />}
                    footer={
                      <div className="flex items-end justify-between gap-3">
                        <TicketStat label="Stake" value={formatCents(bet.stakeCents)} />
                        {bet.netCents !== null ? (
                          <TicketStat
                            label="Net"
                            value={`${bet.netCents > 0 ? '+' : ''}${formatCents(bet.netCents)}`}
                            tone={bet.netCents > 0 ? 'good' : bet.netCents < 0 ? 'bad' : 'default'}
                            align="right"
                          />
                        ) : (
                          <TicketStat
                            label="Pays"
                            value={bet.payoutCents !== null ? formatCents(bet.payoutCents) : '—'}
                            align="right"
                          />
                        )}
                      </div>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function BetBuilder({
  seasonId,
  weekId,
  picks,
  players,
  capRemainingCents,
}: {
  seasonId: string;
  weekId: string;
  picks: ({ id: string } & import('@vault/shared').Pick)[];
  players: Record<string, import('@vault/shared').Player>;
  capRemainingCents: number;
}) {
  const [legIds, setLegIds] = useState<string[]>([]);
  const [stakeInput, setStakeInput] = useState('');
  const [ticketOddsInput, setTicketOddsInput] = useState('');
  const [overridePayout, setOverridePayout] = useState(false);
  const [payoutInput, setPayoutInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const stakeCents = Math.round(Number.parseFloat(stakeInput) * 100);
  const stakeValid = stakeInput.trim() !== '' && Number.isInteger(stakeCents) && stakeCents > 0;
  const ticketOdds = parseOddsInput(ticketOddsInput);
  const ticketOddsValid = ticketOddsInput.trim() !== '' && isValidAmericanOdds(ticketOdds);
  const payoutOverrideCents = overridePayout ? Math.round(Number.parseFloat(payoutInput) * 100) : null;
  const payoutOverrideValid = !overridePayout || (Number.isInteger(payoutOverrideCents) && (payoutOverrideCents ?? 0) > 0);

  const defaultPayoutCents = useMemo(
    () => (stakeValid && ticketOddsValid ? defaultBookPayoutCents(stakeCents, ticketOdds) : null),
    [stakeValid, ticketOddsValid, stakeCents, ticketOdds],
  );

  const wouldExceedCap = stakeValid && stakeCents > capRemainingCents;
  const canSubmit =
    legIds.length > 0 && stakeValid && ticketOddsValid && payoutOverrideValid && !wouldExceedCap && !submitting;

  function toggleLeg(id: string) {
    setLegIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await placeBookBet({
        seasonId,
        weekId,
        legPickIds: legIds,
        stakeCents,
        ticketOdds,
        ...(overridePayout && payoutOverrideCents ? { payoutCentsOverride: payoutOverrideCents } : {}),
      });
      setLegIds([]);
      setStakeInput('');
      setTicketOddsInput('');
      setOverridePayout(false);
      setPayoutInput('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-vault-gold/40 bg-vault-panel p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">Build a bet</h2>
      <form className="flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs text-vault-gold-soft/60">Tap this week&apos;s picks to add them as legs.</legend>
          <div className="flex flex-wrap gap-2">
            {picks.map((p) => {
              const on = legIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleLeg(p.id)}
                  className={`min-h-11 rounded-full border px-3.5 text-sm transition ${
                    on
                      ? 'border-vault-gold bg-vault-gold/15 text-vault-gold'
                      : 'border-vault-steel-700 text-vault-gold-soft/80 hover:border-vault-gold/50'
                  }`}
                >
                  {p.pickText} <span className="font-mono text-xs opacity-70">{formatOdds(p.americanOdds)}</span>
                  <span className="sr-only"> ({players[p.id]?.displayName ?? p.id})</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.12em] text-vault-gold-soft/60">
            Stake ($)
            <input
              id="bet-stake"
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
              inputMode="decimal"
              placeholder="20.00"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.12em] text-vault-gold-soft/60">
            Ticket odds
            <input
              id="bet-odds"
              value={ticketOddsInput}
              onChange={(e) => setTicketOddsInput(e.target.value)}
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="+264"
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex min-h-11 items-center gap-2 text-sm text-vault-gold-soft/75">
          <input
            id="bet-override"
            type="checkbox"
            className="h-5 w-5 accent-vault-gold"
            checked={overridePayout}
            onChange={(e) => setOverridePayout(e.target.checked)}
          />
          Use the exact payout from the ticket
        </label>
        {overridePayout && (
          <input
            id="bet-payout"
            value={payoutInput}
            onChange={(e) => setPayoutInput(e.target.value)}
            inputMode="decimal"
            placeholder="3630.82"
            aria-label="Exact payout ($)"
            className={inputClass}
          />
        )}

        {defaultPayoutCents !== null && !overridePayout && (
          <p className="text-xs text-vault-gold-soft/60">
            Pays <span className="font-mono text-vault-gold-soft">{formatCents(defaultPayoutCents)}</span> if it wins.
          </p>
        )}
        {wouldExceedCap && (
          <p className="text-xs text-vault-loss">
            That stake is more than the {formatCents(capRemainingCents)} left under the cap.
          </p>
        )}

        {error && <ErrorBanner message={error} />}
        {success && <p className="text-sm text-vault-win">Bet placed.</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-1 min-h-11 rounded-lg bg-vault-gold px-4 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
        >
          {submitting ? 'Placing…' : `Place bet · ${formatCents(capRemainingCents)} left`}
        </button>
      </form>
    </section>
  );
}

const inputClass =
  'min-h-11 rounded-lg border border-vault-steel-700 bg-vault-black/40 px-3 py-2.5 font-mono text-base normal-case tracking-normal text-vault-gold-soft outline-none placeholder:text-vault-gold-soft/35 focus:border-vault-gold/60';
