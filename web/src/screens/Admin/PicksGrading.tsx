import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import type { Pick as PickDoc, Player, Week } from '@vault/shared';
import { Card, EmptyState, ErrorBanner, ResultPill } from '../../components/ui';
import { functions } from '../../lib/firebase';
import { formatOdds, formatUnits } from '../../lib/format';
import GradeButtons from './GradeButtons';

const gradePick = httpsCallable<
  { seasonId: string; weekId: string; playerId: string; result: 'win' | 'loss' | 'push' },
  { units: number }
>(functions, 'gradePick');


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

  const gradedCount = (picks ?? []).filter((p) => p.result !== 'pending').length;

  return (
    <Card title={`Grade picks · ${gradedCount} of ${picks?.length ?? 0}`}>
      {error && <ErrorBanner message={error} />}
      <ul className="flex flex-col divide-y divide-vault-line">
        {(picks ?? []).map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="truncate text-vault-gold-soft">
                {p.pickText} <span className="font-mono text-xs text-vault-gold-soft/60">{formatOdds(p.americanOdds)}</span>
              </p>
              <p className="truncate text-xs text-vault-gold-soft/55">
                {players[p.id]?.displayName ?? p.id}
                {p.units !== null && (
                  <span
                    className={`ml-1.5 font-mono ${p.units > 0 ? 'text-vault-win' : p.units < 0 ? 'text-vault-loss' : ''}`}
                  >
                    {formatUnits(p.units)}
                  </span>
                )}
              </p>
            </div>
            {week.status === 'grading' ? (
              <GradeButtons
                current={p.result}
                busy={busyId === p.id}
                subject={`${players[p.id]?.displayName ?? p.id}, ${p.pickText}`}
                onGrade={(r) => void grade(p.id, r)}
              />
            ) : (
              <ResultPill result={p.result} />
            )}
          </li>
        ))}
        {picks && picks.length === 0 && <EmptyState>No picks were sealed this week.</EmptyState>}
      </ul>
    </Card>
  );
}
