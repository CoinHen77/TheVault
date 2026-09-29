import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import { ErrorBanner } from '../../components/ui';
import { functions } from '../../lib/firebase';

const deleteSeason = httpsCallable<{ seasonId: string }, void>(functions, 'deleteSeason');

/**
 * Irreversible hard delete (Zach's call, 2026-09-28): erases the season doc
 * and everything under it — weeks, buy-ins, preloads, picks, book bets,
 * ledger, standings. Gated behind an explicit type-the-season-ID confirmation
 * so a stray tap can't trigger it.
 */
export default function DeleteSeason({ seasonId }: { seasonId: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText === seasonId && !deleting;

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteSeason({ seasonId });
      // On success the season doc is gone; VaultDataProvider's live query
      // picks that up and the Admin screen falls back to CreateSeason.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-red-400">Danger zone</h2>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-red-400 underline decoration-red-400/40 underline-offset-2"
        >
          Delete this season…
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-red-400">
            This permanently deletes <span className="font-semibold">{seasonId}</span> and everything in it — every
            week, buy-in, preload, pick, book bet, ledger entry, and the Sharp standings. There is no undo.
          </p>
          <p className="text-xs text-vault-gold-soft/60">
            Type the season ID (<span className="font-mono text-vault-gold-soft/90">{seasonId}</span>) to confirm.
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={seasonId}
            className="rounded-lg border border-red-500/40 bg-vault-black/40 px-3 py-3 text-sm text-vault-gold-soft outline-none placeholder:text-vault-gold-soft/20 focus:border-red-400"
          />
          {error && <ErrorBanner message={error} />}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canDelete}
              onClick={() => void handleDelete()}
              className="flex-1 rounded-lg bg-red-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : `Permanently delete ${seasonId}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmText('');
                setError(null);
              }}
              className="rounded-lg border border-vault-green-700/60 px-4 py-3 text-sm text-vault-gold-soft/70"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
