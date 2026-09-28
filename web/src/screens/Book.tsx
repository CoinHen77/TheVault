import { httpsCallable } from 'firebase/functions';
import { useMemo, useState } from 'react';
import { defaultBookPayoutCents, isValidAmericanOdds } from '@vault/shared';
import { useAuth } from '../auth/AuthProvider';
import { Card, EmptyState, ErrorBanner, ResultPill } from '../components/ui';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useBookBets, usePicks } from '../hooks/useWeekData';
import { functions } from '../lib/firebase';
import { formatCents, formatOdds, weekLabel } from '../lib/format';

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

  return (
    <div className="flex flex-col gap-4">
      <Card title={`The Book — ${weekLabel(week)}`}>
        {week.status === 'open' ? (
          <EmptyState>The Book opens once picks lock.</EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-vault-gold-soft/50">Cap</p>
              <p className="text-lg font-semibold text-vault-gold">{formatCents(week.bookCapCents)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-vault-gold-soft/50">Remaining</p>
              <p className={`text-lg font-semibold ${capRemainingCents >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCents(capRemainingCents)}
              </p>
            </div>
          </div>
        )}
      </Card>

      {canPlaceBets && picks && (
        <BetBuilder
          seasonId={season.id}
          weekId={week.id}
          picks={picks}
          players={players}
          capRemainingCents={capRemainingCents}
        />
      )}

      <Card title="Placed bets">
        {!bets ? (
          <EmptyState>Bets aren't visible until the week locks.</EmptyState>
        ) : bets.length === 0 ? (
          <EmptyState>No bets placed yet.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-vault-green-700/30">
            {bets.map((bet) => (
              <li key={bet.id} className="flex flex-col gap-1.5 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-vault-gold-soft/90">
                    {bet.legPickIds.length === 1 ? 'Straight' : `${bet.legPickIds.length}-leg parlay`} ·{' '}
                    {formatOdds(bet.ticketOdds)}
                  </span>
                  <ResultPill result={bet.result} />
                </div>
                <p className="text-xs text-vault-gold-soft/50">
                  {bet.legPickIds
                    .map((legId) => {
                      const leg = picks?.find((p) => p.id === legId);
                      const owner = players[legId]?.displayName ?? legId;
                      return leg ? `${owner}: ${leg.pickText}` : owner;
                    })
                    .join(' + ')}
                </p>
                <p className="text-xs text-vault-gold-soft/70">
                  Stake {formatCents(bet.stakeCents)}
                  {bet.payoutCents !== null && ` · Payout ${formatCents(bet.payoutCents)}`}
                  {bet.netCents !== null && (
                    <span className={bet.netCents >= 0 ? ' text-emerald-400' : ' text-red-400'}>
                      {' '}
                      · Net {formatCents(bet.netCents)}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
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
  const ticketOdds = Number.parseInt(ticketOddsInput, 10);
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
    <Card title="Place a bet">
      <form className="flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
        <p className="text-xs font-medium uppercase tracking-wide text-vault-gold-soft/50">Legs</p>
        <ul className="flex flex-col gap-1.5">
          {picks.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2 rounded-lg border border-vault-green-700/40 px-3 py-2 text-sm text-vault-gold-soft/90">
                <input type="checkbox" checked={legIds.includes(p.id)} onChange={() => toggleLeg(p.id)} />
                <span className="min-w-0 flex-1 truncate">
                  {players[p.id]?.displayName ?? p.id}: {p.pickText} ({formatOdds(p.americanOdds)})
                </span>
              </label>
            </li>
          ))}
        </ul>

        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-vault-gold-soft/50">
          Stake ($)
          <input value={stakeInput} onChange={(e) => setStakeInput(e.target.value)} inputMode="decimal" placeholder="20.00" className={inputClass} />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-vault-gold-soft/50">
          Ticket odds
          <input value={ticketOddsInput} onChange={(e) => setTicketOddsInput(e.target.value)} inputMode="numeric" placeholder="+18054" className={inputClass} />
        </label>

        <label className="flex items-center gap-2 text-sm text-vault-gold-soft/70">
          <input type="checkbox" checked={overridePayout} onChange={(e) => setOverridePayout(e.target.checked)} />
          Override exact payout
        </label>
        {overridePayout && (
          <input value={payoutInput} onChange={(e) => setPayoutInput(e.target.value)} inputMode="decimal" placeholder="3630.82" className={inputClass} />
        )}

        {defaultPayoutCents !== null && (
          <p className="text-xs text-vault-gold-soft/50">
            Default payout on a win: <span className="text-vault-gold-soft">{formatCents(defaultPayoutCents)}</span>
          </p>
        )}
        {wouldExceedCap && <p className="text-xs text-red-400">Stake exceeds the cap remaining.</p>}

        {error && <ErrorBanner message={error} />}
        {success && <p className="text-sm text-emerald-400">Bet placed.</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-1 rounded-lg bg-vault-gold px-4 py-3 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
        >
          Place bet
        </button>
      </form>
    </Card>
  );
}

const inputClass =
  'rounded-lg border border-vault-green-700/60 bg-vault-black/40 px-3 py-3 text-sm text-vault-gold-soft outline-none placeholder:text-vault-gold-soft/30 focus:border-vault-gold/60';
