import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import type { Player, Season } from '@vault/shared';
import { Card, EmptyState, ErrorBanner, inputClass } from '../../components/ui';
import { functions } from '../../lib/firebase';
import { sortedPlayers } from '../../lib/players';

const updatePlayerName = httpsCallable<{ uid: string; displayName: string; seasonId?: string }, void>(
  functions,
  'updatePlayerName',
);
const removePlayerFromSeason = httpsCallable<{ seasonId: string; playerId: string }, void>(
  functions,
  'removePlayerFromSeason',
);
const restorePlayerToSeason = httpsCallable<{ seasonId: string; playerId: string }, void>(
  functions,
  'restorePlayerToSeason',
);

/**
 * Admin editing of the player roster: rename anyone (Player.displayName is
 * otherwise self-write-only), and remove/restore a player from the active
 * season's buy-in/pick/preload pickers. Removal is blocked server-side once a
 * player has shares or a paid buy-in/preload this season.
 */
export default function PlayersPanel({
  players,
  season,
}: {
  players: Record<string, Player>;
  season: (Season & { id: string }) | null;
}) {
  return (
    <Card title="Players">
      <ul className="flex flex-col divide-y divide-vault-line">
        {sortedPlayers(players).map(({ uid, player }) => (
          <PlayerRow key={uid} uid={uid} player={player} season={season} />
        ))}
        {Object.keys(players).length === 0 && <EmptyState>No players yet — send an invite above.</EmptyState>}
      </ul>
    </Card>
  );
}

function PlayerRow({
  uid,
  player,
  season,
}: {
  uid: string;
  player: Player;
  season: (Season & { id: string }) | null;
}) {
  const [name, setName] = useState(player.displayName);
  const [savingName, setSavingName] = useState(false);
  const [togglingRemoval, setTogglingRemoval] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removed = Boolean(season?.removedPlayerIds.includes(uid));
  const trimmed = name.trim();
  const nameChanged = trimmed.length > 0 && trimmed !== player.displayName;

  async function saveName() {
    setSavingName(true);
    setError(null);
    try {
      await updatePlayerName({ uid, displayName: trimmed, ...(season ? { seasonId: season.id } : {}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingName(false);
    }
  }

  async function toggleRemoval() {
    if (!season) return;
    setTogglingRemoval(true);
    setError(null);
    try {
      if (removed) {
        await restorePlayerToSeason({ seasonId: season.id, playerId: uid });
      } else {
        await removePlayerFromSeason({ seasonId: season.id, playerId: uid });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTogglingRemoval(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} flex-1`} />
        <button
          type="button"
          disabled={!nameChanged || savingName}
          onClick={() => void saveName()}
          className="min-h-11 shrink-0 rounded-md border border-vault-steel-700 px-3 text-xs text-vault-gold-soft/70 transition hover:border-vault-gold/60 disabled:opacity-40"
        >
          {savingName ? 'Saving…' : 'Save'}
        </button>
      </div>
      {season && (
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs ${removed ? 'text-vault-loss' : 'text-vault-gold-soft/40'}`}>
            {removed ? `Removed from ${season.name}` : `In ${season.name}`}
          </span>
          <button
            type="button"
            disabled={togglingRemoval}
            onClick={() => void toggleRemoval()}
            className="min-h-11 shrink-0 rounded-md border border-vault-steel-700 px-3 text-xs text-vault-gold-soft/70 transition hover:border-vault-gold/60 disabled:opacity-40"
          >
            {togglingRemoval ? '…' : removed ? 'Restore' : 'Remove from season'}
          </button>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
    </li>
  );
}
