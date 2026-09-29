import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import type { Pick as PickDoc, Player, Week } from '@vault/shared';
import { Card, EmptyState, ErrorBanner, ResultPill } from '../../components/ui';
import { functions } from '../../lib/firebase';
import { formatOdds, formatUnits } from '../../lib/format';

const gradePick = httpsCallable<
  { seasonId: string; weekId: string; playerId: string; result: 'win' | 'loss' | 'push' },
  { units: number }
>(functions, 'gradePick');

const RESULTS: ('win' | 'loss' | 'push')[] = ['win', 'loss', 'push'];

/** SPEC.md §5 gradePick: only meaningful once the week is `grading` (or already `closed`, to review). */
export default function PicksGrading({
  seasonId,
  week,
  players,
  picks,
}: {
  seasonId: string;
  week: Week & { id: string };
  players: Record<string, Player>;
  picks: (PickDoc & { id: string })[] | null;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (week.status !== 'grading' && week.status !== 'closed') {
    return null;
  }

  async function grade(playerId: string, result: 'win' | 'loss' | 'push') {
    setBusyId(playerId);
    setError(null);
    try {
      await gradePick({ seasonId, weekId: week.id, playerId, result });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card title="Grade picks">
      {error && <ErrorBanner message={error} />}
      <ul className="flex flex-col divide-y divide-vault-green-700/30">
        {(picks ?? []).map((p) => (
          <li key={p.id} className="flex flex-col gap-2 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-vault-gold-soft">{players[p.id]?.displayName ?? p.id}</p>
                <p className="truncate text-xs text-vault-gold-soft/50">
                  {p.pickText} · {formatOdds(p.americanOdds)}
                </p>
              </div>
              <ResultPill result={p.result} />
            </div>
            {week.status === 'grading' && (
              <div className="flex gap-2">
                {RESULTS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => void grade(p.id, r)}
                    className={`min-h-11 flex-1 rounded-md border px-2 py-1.5 text-xs font-medium capitalize transition disabled:opacity-40 ${
                      p.result === r
                        ? 'border-vault-gold bg-vault-gold/10 text-vault-gold'
                        : 'border-vault-green-700/60 text-vault-gold-soft/70 hover:border-vault-gold/50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
            {p.units !== null && (
              <p
                className={`text-xs ${p.units > 0 ? 'text-emerald-400' : p.units < 0 ? 'text-red-400' : 'text-vault-gold-soft/50'}`}
              >
                {formatUnits(p.units)}
              </p>
            )}
          </li>
        ))}
        {picks && picks.length === 0 && <EmptyState>No picks were submitted this week.</EmptyState>}
      </ul>
    </Card>
  );
}
