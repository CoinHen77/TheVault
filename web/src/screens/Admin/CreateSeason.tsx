import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import { Card, ErrorBanner, Field, inputClass } from '../../components/ui';
import { functions } from '../../lib/firebase';

const createSeason = httpsCallable<
  { seasonId: string; name: string; week4LockAtMs: number; week4BuyInCents?: number },
  { seasonId: string; weekId: string }
>(functions, 'createSeason');

const CURRENT_YEAR = new Date().getFullYear();

/** SPEC.md §5 createSeason: starts from zero at NFL Week 4, caller becomes the first Bookholder, share price $1.00. */
export default function CreateSeason() {
  const [seasonId, setSeasonId] = useState(String(CURRENT_YEAR));
  const [name, setName] = useState(`The Vault ${CURRENT_YEAR}`);
  const [lockAtInput, setLockAtInput] = useState('');
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
      await createSeason({ seasonId: seasonId.trim(), name: name.trim(), week4LockAtMs: lockAtMs });
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
