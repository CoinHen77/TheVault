import { addDoc, collection, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, EmptyState, ErrorBanner } from '../components/ui';
import { useComments } from '../hooks/useComments';
import { db } from '../lib/firebase';
import { COPY } from '../lib/copy';
import { formatTimestampET } from '../lib/format';

const MAX_LENGTH = 1000;

/** Kade's Comment Section: a simple group message board, not part of SPEC.md. */
export default function Comments() {
  const { user, player, isAdmin } = useAuth();
  const { data: comments } = useComments();

  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const canPost = trimmed.length > 0 && trimmed.length <= MAX_LENGTH && !posting && Boolean(user);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!canPost || !user) return;
    setPosting(true);
    setError(null);
    try {
      await addDoc(collection(db, 'comments'), {
        authorId: user.uid,
        authorName: player?.displayName ?? 'Someone',
        text: trimmed,
        createdAt: Timestamp.now(),
      });
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(id: string) {
    setRemovingId(id);
    setError(null);
    try {
      await deleteDoc(doc(db, 'comments', id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-bold text-vault-gold">{COPY.commentsTitle}</h1>
        <p className="text-sm text-vault-gold-soft/60">{COPY.commentsSubtitle}</p>
      </header>

      <form className="flex flex-col gap-2" onSubmit={(e) => void handlePost(e)}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={COPY.commentsPlaceholder}
          rows={3}
          maxLength={MAX_LENGTH}
          className="min-h-24 rounded-lg border border-vault-steel-700 bg-vault-black/40 px-3 py-2.5 text-base text-vault-gold-soft outline-none placeholder:text-vault-gold-soft/35 focus:border-vault-gold/60"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-vault-gold-soft/40">
            {trimmed.length}/{MAX_LENGTH}
          </span>
          <button
            type="submit"
            disabled={!canPost}
            className="min-h-11 rounded-lg bg-vault-gold px-5 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
          >
            {posting ? '…' : COPY.commentsPost}
          </button>
        </div>
        {error && <ErrorBanner message={error} />}
      </form>

      <ul className="flex flex-col gap-3">
        {(comments ?? []).map((c) => {
          const canDelete = c.authorId === user?.uid || isAdmin;
          return (
            <li key={c.id} className="flex gap-3 rounded-xl border border-vault-line bg-vault-panel px-3.5 py-3">
              <Avatar name={c.authorName} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-vault-gold-soft">{c.authorName}</span>
                  <span className="shrink-0 text-xs text-vault-gold-soft/40">{formatTimestampET(c.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-vault-gold-soft/85">
                  {c.text}
                </p>
                {canDelete && (
                  <button
                    type="button"
                    disabled={removingId === c.id}
                    onClick={() => void handleDelete(c.id)}
                    className="mt-1.5 text-xs text-vault-gold-soft/40 underline decoration-vault-gold-soft/25 underline-offset-2 transition hover:text-vault-loss disabled:opacity-40"
                  >
                    {removingId === c.id ? 'Removing…' : 'Delete'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {comments && comments.length === 0 && <EmptyState>{COPY.commentsEmpty}</EmptyState>}
      </ul>
    </div>
  );
}
