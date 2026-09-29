import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import type { Player, Preload } from '@vault/shared';
import { Card, EmptyState, ErrorBanner } from '../../components/ui';
import { usePreloads } from '../../hooks/useWeekData';
import { functions } from '../../lib/firebase';
import { formatCents } from '../../lib/format';
import { sortedPlayers } from '../../lib/players';

const markPreloadPaid = httpsCallable<
  { seasonId: string; playerId: string; amountCentsOverride?: number },
  { sharesIssued: number; amountCents: number }
>(functions, 'markPreloadPaid');

const unmarkPreload = httpsCallable<{ seasonId: string; playerId: string }, void>(functions, 'unmarkPreload');

/**
 * Season-scoped, not tied to any week: a one-time deposit gating markBuyInPaid
 * via Season.requiredPreloadCents (0 = no gate, panel still shown so the
 * Admin can see everyone's preload for context).
 */
export default function PreloadPanel({
  seasonId,
  requiredPreloadCents,
  players,
}: {
  seasonId: string;
  requiredPreloadCents: number;
  players: Record<string, Player>;
}) {
  const { data: preloads } = usePreloads(seasonId);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preloadByUid: Record<string, Preload & { id: string }> = {};
  for (const p of preloads ?? []) preloadByUid[p.id] = p;

  async function toggle(uid: string, paid: boolean) {
    setBusyUid(uid);
    setError(null);
    try {
      if (paid) {
        await unmarkPreload({ seasonId, playerId: uid });
      } else {
        await markPreloadPaid({ seasonId, playerId: uid });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <Card title="Preload">
      <p className="mb-3 text-xs text-vault-gold-soft/40">
        {requiredPreloadCents > 0
          ? `Each player must preload ${formatCents(requiredPreloadCents)} before their weekly buy-ins can be marked paid.`
          : 'No preload is required for this season — every player can buy into weeks freely.'}
      </p>
      {error && <ErrorBanner message={error} />}
      <ul className="flex flex-col divide-y divide-vault-green-700/30">
        {sortedPlayers(players).map(({ uid, player }) => {
          const preload = preloadByUid[uid];
          const paid = Boolean(preload?.paid);
          return (
            <li key={uid} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0 truncate text-vault-gold-soft/90">{player.displayName}</span>
              <div className="flex shrink-0 items-center gap-2">
                <span className={paid ? 'text-emerald-400' : 'text-vault-gold-soft/40'}>
                  {paid ? formatCents(preload!.amountCents) : 'Not preloaded'}
                </span>
                <button
                  type="button"
                  disabled={busyUid === uid}
                  onClick={() => void toggle(uid, paid)}
                  className="rounded-md border border-vault-green-700/60 px-2 py-1 text-xs text-vault-gold-soft/70 transition hover:border-vault-gold/60 disabled:opacity-40"
                >
                  {paid ? 'Unmark' : 'Mark paid'}
                </button>
              </div>
            </li>
          );
        })}
        {Object.keys(players).length === 0 && <EmptyState>No players yet — send an invite above.</EmptyState>}
      </ul>
    </Card>
  );
}
