import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { isValidAmericanOdds } from '@vault/shared';
import type { Pick as PickDoc, Player, Week } from '@vault/shared';
import { Card, EmptyState, ErrorBanner, Field, inputClass } from '../../components/ui';
import { useBuyIns } from '../../hooks/useWeekData';
import { functions } from '../../lib/firebase';
import { sortedPlayers } from '../../lib/players';

const adminSubmitPick = httpsCallable<
  { seasonId: string; weekId: string; playerId: string; pickText: string; gameText: string; americanOdds: number },
  void
>(functions, 'adminSubmitPick');

/** SPEC.md §5 adminSubmitPick: allowed in any status except `closed`. */
export default function AdminPickEntry({
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
  const { data: buyIns } = useBuyIns(seasonId, week.id);
  const paidUids = new Set((buyIns ?? []).filter((b) => b.paid).map((b) => b.id));

  const [playerId, setPlayerId] = useState('');
  const [gameText, setGameText] = useState('');
  const [pickText, setPickText] = useState('');
  const [oddsInput, setOddsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const existing = picks?.find((p) => p.id === playerId);

  useEffect(() => {
    if (existing) {
      setGameText(existing.gameText);
      setPickText(existing.pickText);
      setOddsInput(String(existing.americanOdds));
    } else {
      setGameText('');
      setPickText('');
      setOddsInput('');
    }
    setSuccess(false);
  }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (week.status === 'closed') {
    return (
      <Card title="Enter a pick on someone's behalf">
        <EmptyState>{week.id} is closed.</EmptyState>
      </Card>
    );
  }

  const odds = Number.parseInt(oddsInput, 10);
  const oddsValid = oddsInput.trim() !== '' && isValidAmericanOdds(odds);
  const canSubmit = playerId !== '' && gameText.trim() !== '' && pickText.trim() !== '' && oddsValid && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await adminSubmitPick({
        seasonId,
        weekId: week.id,
        playerId,
        gameText: gameText.trim(),
        pickText: pickText.trim(),
        americanOdds: odds,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const paidPlayers = sortedPlayers(players).filter(({ uid }) => paidUids.has(uid));

  return (
    <Card title="Enter a pick on someone's behalf">
      <form className="flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
        <Field label="Player">
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={inputClass}>
            <option value="">Select a paid player…</option>
            {paidPlayers.map(({ uid, player }) => (
              <option key={uid} value={uid}>
                {player.displayName}
                {picks?.some((p) => p.id === uid) ? ' (has a pick)' : ''}
              </option>
            ))}
          </select>
        </Field>
        {paidPlayers.length === 0 && (
          <p className="text-xs text-vault-gold-soft/40">No paid players yet — mark a buy-in first.</p>
        )}
        <Field label="Game">
          <input value={gameText} onChange={(e) => setGameText(e.target.value)} placeholder="CHI vs CAR" className={inputClass} />
        </Field>
        <Field label="Pick">
          <input value={pickText} onChange={(e) => setPickText(e.target.value)} placeholder="Bears -2.5" className={inputClass} />
        </Field>
        <Field label="American odds">
          <input
            value={oddsInput}
            onChange={(e) => setOddsInput(e.target.value)}
            inputMode="numeric"
            placeholder="-138"
            className={inputClass}
          />
        </Field>
        {error && <ErrorBanner message={error} />}
        {success && <p className="text-sm text-vault-win">Saved.</p>}
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-vault-gold px-4 py-3 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
        >
          {existing ? 'Update pick' : 'Save pick'}
        </button>
      </form>
    </Card>
  );
}
