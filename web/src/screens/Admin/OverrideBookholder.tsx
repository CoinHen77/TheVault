import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import type { Player, Week } from '@vault/shared';
import { Card, ErrorBanner, Field, inputClass } from '../../components/ui';
import { functions } from '../../lib/firebase';
import { sortedPlayers } from '../../lib/players';

const overrideBookholder = httpsCallable<
  { seasonId: string; weekId: string; target: 'current' | 'next'; newBookholderId: string },
  void
>(functions, 'overrideBookholder');

/** SPEC.md §5 overrideBookholder: sets the current or next Bookholder; every override is logged via bookDecision. */
export default function OverrideBookholder({
  seasonId,
  week,
  players,
}: {
  seasonId: string;
  week: Week & { id: string };
  players: Record<string, Player>;
}) {
  const [target, setTarget] = useState<'current' | 'next'>('current');
  const [newBookholderId, setNewBookholderId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit = newBookholderId !== '' && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await overrideBookholder({ seasonId, weekId: week.id, target, newBookholderId });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="Override Bookholder">
      <p className="mb-3 text-xs text-vault-gold-soft/40">
        Current: {players[week.bookholderId]?.displayName ?? week.bookholderId}
        {week.nextBookholderId && ` · Next: ${players[week.nextBookholderId]?.displayName ?? week.nextBookholderId}`}
      </p>
      <form className="flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
        <Field label="Which slot">
          <select value={target} onChange={(e) => setTarget(e.target.value as 'current' | 'next')} className={inputClass}>
            <option value="current">This week's Bookholder</option>
            <option value="next">Next week's Bookholder</option>
          </select>
        </Field>
        <Field label="New Bookholder">
          <select value={newBookholderId} onChange={(e) => setNewBookholderId(e.target.value)} className={inputClass}>
            <option value="">Select a player…</option>
            {sortedPlayers(players).map(({ uid, player }) => (
              <option key={uid} value={uid}>
                {player.displayName}
              </option>
            ))}
          </select>
        </Field>
        {error && <ErrorBanner message={error} />}
        {success && <p className="text-sm text-vault-win">Bookholder updated.</p>}
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-vault-gold px-4 py-3 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
        >
          Override
        </button>
      </form>
    </Card>
  );
}
