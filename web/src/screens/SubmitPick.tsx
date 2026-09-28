import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { isValidAmericanOdds, unitsForPick } from '@vault/shared';
import { useAuth } from '../auth/AuthProvider';
import { Card, EmptyState, ErrorBanner } from '../components/ui';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useMyBuyIn, useMyPick } from '../hooks/useWeekData';
import { functions } from '../lib/firebase';
import { formatCents, formatTimestampET, formatUnits, weekLabel } from '../lib/format';

const submitPick = httpsCallable<
  { seasonId: string; weekId: string; pickText: string; gameText: string; americanOdds: number },
  void
>(functions, 'submitPick');

export default function SubmitPick() {
  const { user } = useAuth();
  const { season, week } = useVaultData();
  const { data: buyIn } = useMyBuyIn(season?.id ?? null, week?.id ?? null, user?.uid ?? null);
  const { data: pick } = useMyPick(season?.id ?? null, week?.id ?? null, user?.uid ?? null);

  const [gameText, setGameText] = useState('');
  const [pickText, setPickText] = useState('');
  const [oddsInput, setOddsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!pick) return;
    setGameText(pick.gameText);
    setPickText(pick.pickText);
    setOddsInput(String(pick.americanOdds));
  }, [pick]);

  if (!season || !week) {
    return <EmptyState>No active season yet.</EmptyState>;
  }

  const now = Date.now();
  const disabledReason =
    week.status !== 'open'
      ? `Picks for ${weekLabel(week)} are ${week.status}.`
      : now >= week.lockAt.toMillis()
        ? 'Picks just locked.'
        : !buyIn?.paid
          ? `Mark your ${formatCents(week.buyInCents)} buy-in as paid before submitting a pick.`
          : null;

  const odds = Number.parseInt(oddsInput, 10);
  const oddsValid = oddsInput.trim() !== '' && isValidAmericanOdds(odds);
  const impliedUnits = oddsValid ? unitsForPick(odds, 'win') : null;

  const canSubmit = !disabledReason && gameText.trim() && pickText.trim() && oddsValid && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!season || !week || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await submitPick({
        seasonId: season.id,
        weekId: week.id,
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

  return (
    <div className="flex flex-col gap-4">
      <Card title={`Your Best Bet — ${weekLabel(week)}`}>
        {disabledReason && (
          <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
            {disabledReason}
          </p>
        )}
        <p className="mb-4 text-xs text-vault-gold-soft/40">
          Locks {formatTimestampET(week.lockAt)}. Only games starting after lock are eligible (honor system).
        </p>

        <form className="flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
          <Field label="Game">
            <input
              value={gameText}
              onChange={(e) => setGameText(e.target.value)}
              placeholder="CHI vs CAR"
              disabled={Boolean(disabledReason)}
              className={inputClass}
            />
          </Field>

          <Field label="Pick">
            <input
              value={pickText}
              onChange={(e) => setPickText(e.target.value)}
              placeholder="Bears -2.5"
              disabled={Boolean(disabledReason)}
              className={inputClass}
            />
          </Field>

          <Field label="American odds">
            <input
              value={oddsInput}
              onChange={(e) => setOddsInput(e.target.value)}
              placeholder="-138"
              inputMode="numeric"
              disabled={Boolean(disabledReason)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-vault-gold-soft/40">
              Integer, ≤ −100 or ≥ +100.{' '}
              {oddsInput.trim() !== '' && !oddsValid && <span className="text-red-400">Invalid odds.</span>}
            </p>
          </Field>

          {impliedUnits !== null && (
            <p className="text-sm text-vault-gold-soft/70">
              Implied units if it wins: <span className="font-semibold text-emerald-400">{formatUnits(impliedUnits)}</span>
            </p>
          )}

          {error && <ErrorBanner message={error} />}
          {success && <p className="text-sm text-emerald-400">Pick saved.</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-1 rounded-lg bg-vault-gold px-4 py-3 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
          >
            {pick ? 'Update Pick' : 'Submit Pick'}
          </button>
        </form>
      </Card>
    </div>
  );
}

const inputClass =
  'rounded-lg border border-vault-green-700/60 bg-vault-black/40 px-3 py-3 text-sm text-vault-gold-soft outline-none placeholder:text-vault-gold-soft/30 focus:border-vault-gold/60 disabled:opacity-40';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-vault-gold-soft/50">
      {label}
      {children}
    </label>
  );
}
