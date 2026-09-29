import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import type { BuyIn, Player, Week } from '@vault/shared';
import { Card, EmptyState, ErrorBanner } from '../../components/ui';
import { useBuyIns } from '../../hooks/useWeekData';
import { functions } from '../../lib/firebase';
import { formatCents } from '../../lib/format';
import { sortedPlayers } from '../../lib/players';

const markBuyInPaid = httpsCallable<
  { seasonId: string; weekId: string; playerId: string; amountCentsOverride?: number },
  { sharesIssued: number; amountCents: number }
>(functions, 'markBuyInPaid');

const unmarkBuyIn = httpsCallable<{ seasonId: string; weekId: string; playerId: string }, void>(
  functions,
  'unmarkBuyIn',
);

/** SPEC.md §5 markBuyInPaid/unmarkBuyIn: only while the week is `open`. */
export default function BuyInsPanel({
  seasonId,
  week,
  players,
}: {
  seasonId: string;
  week: Week & { id: string };
  players: Record<string, Player>;
}) {
  const { data: buyIns } = useBuyIns(seasonId, week.id);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buyInByUid: Record<string, BuyIn & { id: string }> = {};
  for (const b of buyIns ?? []) buyInByUid[b.id] = b;

  const canEdit = week.status === 'open';

  async function toggle(uid: string, paid: boolean) {
    setBusyUid(uid);
    setError(null);
    try {
      if (paid) {
        await unmarkBuyIn({ seasonId, weekId: week.id, playerId: uid });
      } else {
        await markBuyInPaid({ seasonId, weekId: week.id, playerId: uid });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <Card title="Buy-ins">
      {error && <ErrorBanner message={error} />}
      <ul className="flex flex-col divide-y divide-vault-line">
        {sortedPlayers(players).map(({ uid, player }) => {
          const buyIn = buyInByUid[uid];
          const paid = Boolean(buyIn?.paid);
          return (
            <li key={uid} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0 truncate text-vault-gold-soft/90">{player.displayName}</span>
              <div className="flex shrink-0 items-center gap-2">
                <span className={paid ? 'text-vault-win' : 'text-vault-gold-soft/40'}>
                  {paid ? formatCents(buyIn!.amountCents) : 'Unpaid'}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    disabled={busyUid === uid}
                    onClick={() => void toggle(uid, paid)}
                    className="min-h-11 rounded-md border border-vault-steel-700 px-3 py-1 text-xs text-vault-gold-soft/70 transition hover:border-vault-gold/60 disabled:opacity-40"
                  >
                    {paid ? 'Unmark' : 'Mark paid'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {Object.keys(players).length === 0 && <EmptyState>No players yet — send an invite above.</EmptyState>}
      </ul>
    </Card>
  );
}
