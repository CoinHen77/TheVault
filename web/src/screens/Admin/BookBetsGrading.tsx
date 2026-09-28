import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import type { BookBet, Pick as PickDoc, Player, Week } from '@vault/shared';
import { Card, EmptyState, ErrorBanner, ResultPill } from '../../components/ui';
import { functions } from '../../lib/firebase';
import { formatCents, formatOdds } from '../../lib/format';

const gradeBookBet = httpsCallable<
  { seasonId: string; weekId: string; betId: string; result: 'win' | 'loss' | 'push'; payoutCentsOverride?: number },
  { netCents: number }
>(functions, 'gradeBookBet');

const RESULTS: ('win' | 'loss' | 'push')[] = ['win', 'loss', 'push'];

/** SPEC.md §5 gradeBookBet: only meaningful once the week is `grading` (or already `closed`, to review). */
export default function BookBetsGrading({
  seasonId,
  week,
  bets,
  picks,
  players,
}: {
  seasonId: string;
  week: Week & { id: string };
  bets: (BookBet & { id: string })[] | null;
  picks: (PickDoc & { id: string })[] | null;
  players: Record<string, Player>;
}) {
  const [payoutOverrides, setPayoutOverrides] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (week.status !== 'grading' && week.status !== 'closed') {
    return null;
  }

  async function grade(betId: string, result: 'win' | 'loss' | 'push') {
    setBusyId(betId);
    setError(null);
    try {
      const overrideInput = payoutOverrides[betId]?.trim();
      const payoutCentsOverride = overrideInput ? Math.round(Number.parseFloat(overrideInput) * 100) : undefined;
      await gradeBookBet({
        seasonId,
        weekId: week.id,
        betId,
        result,
        ...(payoutCentsOverride !== undefined ? { payoutCentsOverride } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card title="Grade book bets">
      {error && <ErrorBanner message={error} />}
      <ul className="flex flex-col divide-y divide-vault-green-700/30">
        {(bets ?? []).map((bet) => (
          <li key={bet.id} className="flex flex-col gap-2 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-vault-gold-soft/90">
                {bet.legPickIds.length === 1 ? 'Straight' : `${bet.legPickIds.length}-leg parlay`} ·{' '}
                {formatOdds(bet.ticketOdds)} · Stake {formatCents(bet.stakeCents)}
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
            {week.status === 'grading' && (
              <>
                <input
                  value={payoutOverrides[bet.id] ?? ''}
                  onChange={(e) => setPayoutOverrides((prev) => ({ ...prev, [bet.id]: e.target.value }))}
                  placeholder={`Payout override ($, default ${formatCents(bet.payoutCents ?? 0)})`}
                  inputMode="decimal"
                  className="rounded-lg border border-vault-green-700/60 bg-vault-black/40 px-3 py-2 text-xs text-vault-gold-soft outline-none placeholder:text-vault-gold-soft/30 focus:border-vault-gold/60"
                />
                <div className="flex gap-2">
                  {RESULTS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={busyId === bet.id}
                      onClick={() => void grade(bet.id, r)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium capitalize transition disabled:opacity-40 ${
                        bet.result === r
                          ? 'border-vault-gold bg-vault-gold/10 text-vault-gold'
                          : 'border-vault-green-700/60 text-vault-gold-soft/70 hover:border-vault-gold/50'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </>
            )}
            {bet.netCents !== null && (
              <p className={`text-xs ${bet.netCents >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                Net {formatCents(bet.netCents)}
              </p>
            )}
          </li>
        ))}
        {bets && bets.length === 0 && <EmptyState>No book bets were placed this week.</EmptyState>}
      </ul>
    </Card>
  );
}
