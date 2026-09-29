import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import type { WeekType } from '@vault/shared';
import { Card, ErrorBanner, Field, inputClass } from '../../components/ui';
import { functions } from '../../lib/firebase';
import { weekTypeLabel } from '../../lib/format';
import { DEFAULT_BUY_IN_CENTS, WEEK_TYPE_OPTIONS } from '../../lib/weekDefaults';

const createSeason = httpsCallable<
  {
    seasonId: string;
    name: string;
    week4LockAtMs: number;
    buyInDefaultsCents: Record<WeekType, number>;
    requiredPreloadCents: number;
  },
  { seasonId: string; weekId: string }
>(functions, 'createSeason');

const CURRENT_YEAR = new Date().getFullYear();

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function inputToCents(input: string): number {
  return Math.round(Number.parseFloat(input || '0') * 100);
}

/** SPEC.md §5 createSeason: starts from zero at NFL Week 4, caller becomes the first Bookholder, share price $1.00. */
export default function CreateSeason() {
  const [seasonId, setSeasonId] = useState(String(CURRENT_YEAR));
  const [name, setName] = useState(`The Vault ${CURRENT_YEAR}`);
  const [lockAtInput, setLockAtInput] = useState('');
  const [buyInInputs, setBuyInInputs] = useState<Record<WeekType, string>>(() => {
    const initial = {} as Record<WeekType, string>;
    for (const t of WEEK_TYPE_OPTIONS) initial[t] = centsToInput(DEFAULT_BUY_IN_CENTS[t]);
    return initial;
  });
  const [requiredPreloadInput, setRequiredPreloadInput] = useState('0.00');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockAtMs = lockAtInput ? new Date(lockAtInput).getTime() : NaN;
  const canSubmit = seasonId.trim() !== '' && name.trim() !== '' && Number.isFinite(lockAtMs) && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const buyInDefaultsCents = {} as Record<WeekType, number>;
      for (const t of WEEK_TYPE_OPTIONS) buyInDefaultsCents[t] = inputToCents(buyInInputs[t]);
      await createSeason({
        seasonId: seasonId.trim(),
        name: name.trim(),
        week4LockAtMs: lockAtMs,
        buyInDefaultsCents,
        requiredPreloadCents: inputToCents(requiredPreloadInput),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="Create the season">
      <p className="mb-3 text-xs text-vault-gold-soft/40">
        Starts from zero at NFL Week 4 with an empty Vault, share price $1.00 and you as the first Bookholder
        (SPEC.md §1.1, §5).
      </p>
      <form className="flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
        <Field label="Season ID">
          <input value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Week 4 lock time">
          <input
            type="datetime-local"
            value={lockAtInput}
            onChange={(e) => setLockAtInput(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="mt-1 border-t border-vault-line pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-vault-gold-soft/50">
            Buy-in defaults by week type
          </p>
          <p className="mb-2 text-xs text-vault-gold-soft/40">
            Pre-fills Week 4 and every week closeWeek auto-creates after it. Still editable per-week later.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {WEEK_TYPE_OPTIONS.map((t) => (
              <Field key={t} label={weekTypeLabel(t)}>
                <input
                  value={buyInInputs[t]}
                  onChange={(e) => setBuyInInputs((prev) => ({ ...prev, [t]: e.target.value }))}
                  inputMode="decimal"
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
        </div>

        <div className="border-t border-vault-line pt-3">
          <Field label="Required preload per player ($)">
            <input
              value={requiredPreloadInput}
              onChange={(e) => setRequiredPreloadInput(e.target.value)}
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
          <p className="mt-1 text-xs text-vault-gold-soft/40">
            0 = no gate. Otherwise a player's weekly buy-ins can't be marked paid until their preload (Admin screen,
            below, once the season exists) reaches this amount.
          </p>
        </div>

        {error && <ErrorBanner message={error} />}
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-vault-gold px-4 py-3 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
        >
          Create season
        </button>
      </form>
    </Card>
  );
}
