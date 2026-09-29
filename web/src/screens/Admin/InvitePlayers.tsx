import { addDoc, collection, deleteDoc, doc, setDoc, Timestamp } from 'firebase/firestore';
import { useState } from 'react';
import type { Invite } from '@vault/shared';
import { useAuth } from '../../auth/AuthProvider';
import { Card, EmptyState, ErrorBanner, inputClass } from '../../components/ui';
import { useCollectionData } from '../../hooks/useCollectionData';
import { db } from '../../lib/firebase';
import { formatTimestampET } from '../../lib/format';
import { buildInviteEmail } from '../../lib/inviteEmail';

/**
 * SPEC.md §6: invites/{email} is an Admin-managed allowlist. firestore.rules
 * lets an Admin write it directly (`allow read, write: if isAdmin()`), so
 * this goes straight to Firestore rather than through a Cloud Function.
 *
 * Also queues a `mail` doc for the "Trigger Email from Firestore" extension,
 * which sends it via the SMTP credentials configured on that extension (not
 * stored anywhere in this repo or Firestore).
 */
export default function InvitePlayers() {
  const { user } = useAuth();
  const { data: invites } = useCollectionData<Invite>('invites');

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailValid && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !user) return;
    setSubmitting(true);
    setError(null);
    try {
      const normalized = email.trim().toLowerCase();
      const trimmedName = displayName.trim();
      const invite: Invite = {
        invitedBy: user.uid,
        invitedAt: Timestamp.now(),
        ...(trimmedName ? { displayName: trimmedName } : {}),
      };
      await setDoc(doc(db, 'invites', normalized), invite);

      const { subject, html } = buildInviteEmail(window.location.origin, trimmedName || undefined);
      await addDoc(collection(db, 'mail'), { to: [normalized], message: { subject, html } });

      setEmail('');
      setDisplayName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  /** Only blocks a future sign-up with this email — it doesn't revoke access for someone already signed in. */
  async function handleRemove(email: string) {
    setRemovingId(email);
    setError(null);
    try {
      await deleteDoc(doc(db, 'invites', email));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card title="Invite players">
      <form className="flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="player@example.com"
          inputMode="email"
          className={inputClass}
        />
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name (optional)"
          className={inputClass}
        />
        {error && <ErrorBanner message={error} />}
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-vault-gold px-4 py-3 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
        >
          Send invite
        </button>
      </form>

      <ul className="mt-4 flex flex-col divide-y divide-vault-line border-t border-vault-line">
        {(invites ?? []).map((inv) => (
          <li key={inv.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 truncate text-vault-gold-soft/90">
              {inv.displayName ? `${inv.displayName} · ` : ''}
              {inv.id}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-vault-gold-soft/40">{formatTimestampET(inv.invitedAt)}</span>
              <button
                type="button"
                disabled={removingId === inv.id}
                onClick={() => void handleRemove(inv.id)}
                className="min-h-11 rounded-md border border-vault-steel-700 px-3 text-xs text-vault-gold-soft/70 transition hover:border-vault-loss/60 disabled:opacity-40"
              >
                {removingId === inv.id ? '…' : 'Remove'}
              </button>
            </div>
          </li>
        ))}
        {invites && invites.length === 0 && <EmptyState>No invites sent yet.</EmptyState>}
      </ul>
    </Card>
  );
}
