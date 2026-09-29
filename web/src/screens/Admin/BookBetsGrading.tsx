import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import type { BookBet, Pick as PickDoc, Player, Week } from '@vault/shared';
import { Card, EmptyState, ErrorBanner, inputClass, ResultPill } from '../../components/ui';
import { functions } from '../../lib/firebase';
import { formatCents, formatOdds } from '../../lib/format';
import GradeButtons from './GradeButtons';

const gradeBookBet = httpsCallable<
  { seasonId: string; weekId: string; betId: string; result: 'win' | 'loss' | 'push'; payoutCentsOverride?: number },
  { netCents: number }
>(functions, 'gradeBookBet');


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

  const gradedCount = (bets ?? []).filter((b) => b.result !== 'pending').length;

  return (
    <Card title={`Grade book bets · ${gradedCount} of ${bets?.length ?? 0}`}>
      {error && <ErrorBanner message={error} />}
      <ul className="flex flex-col divide-y divide-vault-line">
        {(bets ?? []).map((bet) => {
          const name = `${bet.legPickIds.length === 1 ? 'Straight' : `${bet.legPickIds.length}-leg parlay`} ${formatOdds(bet.ticketOdds)}`;
          return (
            <li key={bet.id} className="flex flex-col gap-2 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-vault-gold-soft">
                    {bet.legPickIds.length === 1 ? 'Straight' : `${bet.legPickIds.length}-leg parlay`}{' '}
                    <span className="font-mono text-xs text-vault-gold-soft/60">{formatOdds(bet.ticketOdds)}</span>
                  </p>
                  <p className="text-xs text-vault-gold-soft/55">
                    Stake <span className="font-mono">{formatCents(bet.stakeCents)}</span>
                    {bet.netCents !== null && (
                      <span className={`ml-1.5 font-mono ${bet.netCents > 0 ? 'text-vault-win' : bet.netCents < 0 ? 'text-vault-loss' : ''}`}>
                        · Net {bet.netCents > 0 ? '+' : ''}
                        {formatCents(bet.netCents)}
                      </span>
                    )}
                  </p>
                </div>
                {week.status === 'grading' ? (
                  <GradeButtons
                    current={bet.result}
                    busy={busyId === bet.id}
                    subject={name}
                    onGrade={(r) => void grade(bet.id, r)}
                  />
                ) : (
                  <ResultPill result={bet.result} />
                )}
              </div>
              <p className="text-xs text-vault-gold-soft/55">
                {bet.legPickIds
                  .map((legId) => {
                    const leg = picks?.find((p) => p.id === legId);
                    const owner = players[legId]?.displayName ?? legId;
                    return leg ? `${owner}: ${leg.pickText}` : owner;
                  })
                  .join(' + ')}
              </p>
              {week.status === 'grading' && (
                <label className="flex flex-col gap-1 text-xs text-vault-gold-soft/60">
                  Exact payout from the ticket, if different (optional)
                  <input
                    id={`payout-${bet.id}`}
                    value={payoutOverrides[bet.id] ?? ''}
                    onChange={(e) => setPayoutOverrides((prev) => ({ ...prev, [bet.id]: e.target.value }))}
                    placeholder={`Default ${formatCents(bet.payoutCents ?? 0)}`}
                    inputMode="decimal"
                    className={inputClass}
                  />
                </label>
              )}
            </li>
          );
        })}
        {bets && bets.length === 0 && <EmptyState>No book bets were placed this week.</EmptyState>}
      </ul>
    </Card>
  );
}
