import { addDoc, collection, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import type { Comment } from '@vault/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, EmptyState, ErrorBanner } from '../components/ui';
import { useComments } from '../hooks/useComments';
import { db } from '../lib/firebase';
import { COPY } from '../lib/copy';
import { formatTimestampET } from '../lib/format';

const MAX_LENGTH = 1000;
/** Replies indent one step per level up to this depth, then stay level so phones don't run out of width. */
const MAX_INDENT_DEPTH = 3;

type CommentRow = { id: string } & Comment;

/**
 * Kade's Comment Section: a simple group message board, not part of SPEC.md.
 * Comments are newest first; replies sit indented under the comment or reply
 * they answer, oldest first. A reply whose parent was deleted shows at the
 * top level.
 */
export default function Comments() {
  const { user, player, isAdmin } = useAuth();
  const { data: comments } = useComments();

  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { roots, repliesTo } = useMemo(() => {
    const all = comments ?? [];
    const ids = new Set(all.map((c) => c.id));
    const replies = new Map<string, CommentRow[]>();
    const top: CommentRow[] = [];
    for (const c of all) {
      if (c.parentId && ids.has(c.parentId)) {
        replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), c]);
      } else {
        top.push(c);
      }
    }
    // useComments is newest first; replies read top to bottom as a conversation.
    for (const list of replies.values()) list.reverse();
    return { roots: top, repliesTo: replies };
  }, [comments]);

  const trimmed = text.trim();
  const canPost = trimmed.length > 0 && trimmed.length <= MAX_LENGTH && !posting && Boolean(user);

  async function post(body: string, parentId: string | null): Promise<boolean> {
    if (!user) return false;
    setPosting(true);
    setError(null);
    try {
      await addDoc(collection(db, 'comments'), {
        authorId: user.uid,
        authorName: player?.displayName ?? 'Someone',
        text: body,
        createdAt: Timestamp.now(),
        ...(parentId ? { parentId } : {}),
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setPosting(false);
    }
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (canPost && (await post(trimmed, null))) setText('');
  }

  async function handleReply(parentId: string) {
    const body = replyText.trim();
    if (!body || body.length > MAX_LENGTH || posting) return;
    if (await post(body, parentId)) {
      setReplyText('');
      setReplyingTo(null);
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

  function renderComment(c: CommentRow, depth: number): React.ReactNode {
    const canDelete = c.authorId === user?.uid || isAdmin;
    const replies = repliesTo.get(c.id) ?? [];
    const isReply = depth > 0;

    const actions = (
      <div className="mt-0.5 flex items-center gap-1">
        {user && (
          <button
            type="button"
            onClick={() => {
              setReplyingTo(replyingTo === c.id ? null : c.id);
              setReplyText('');
            }}
            className="min-h-11 px-1 text-xs text-vault-gold-soft/55 underline decoration-vault-gold-soft/25 underline-offset-2 transition hover:text-vault-gold"
          >
            {replyingTo === c.id ? 'Cancel' : 'Reply'}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            disabled={removingId === c.id}
            onClick={() => void handleDelete(c.id)}
            className="min-h-11 px-1 text-xs text-vault-gold-soft/40 underline decoration-vault-gold-soft/25 underline-offset-2 transition hover:text-vault-loss disabled:opacity-40"
          >
            {removingId === c.id ? 'Removing…' : 'Delete'}
          </button>
        )}
      </div>
    );

    const replyForm = replyingTo === c.id && (
      <form
        className="mt-1 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleReply(c.id);
        }}
      >
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder={`Reply to ${c.authorName}…`}
          rows={2}
          maxLength={MAX_LENGTH}
          autoFocus
          className="min-h-16 rounded-lg border border-vault-steel-700 bg-vault-black/40 px-3 py-2 text-base text-vault-gold-soft outline-none placeholder:text-vault-gold-soft/35 focus:border-vault-gold/60"
        />
        <button
          type="submit"
          disabled={!replyText.trim() || posting}
          className="min-h-11 self-end rounded-lg bg-vault-gold px-4 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
        >
          {posting ? '…' : 'Reply'}
        </button>
      </form>
    );

    const thread = replies.length > 0 && (
      <ul className={`mt-1 flex flex-col gap-1 ${depth < MAX_INDENT_DEPTH ? 'ml-1 border-l border-vault-line pl-3' : ''}`}>
        {replies.map((r) => (
          <li key={r.id}>{renderComment(r, depth + 1)}</li>
        ))}
      </ul>
    );

    if (isReply) {
      return (
        <div className="py-1">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-vault-gold-soft/85">
            <span className="font-medium text-vault-gold-soft">{c.authorName}</span>{' '}
            <span className="text-xs text-vault-gold-soft/40">{formatTimestampET(c.createdAt)}</span>
            <br />
            {c.text}
          </p>
          {actions}
          {replyForm}
          {thread}
        </div>
      );
    }

    return (
      <div className="flex gap-3 rounded-xl border border-vault-line bg-vault-panel px-3.5 py-3">
        <Avatar name={c.authorName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-vault-gold-soft">{c.authorName}</span>
            <span className="shrink-0 text-xs text-vault-gold-soft/40">{formatTimestampET(c.createdAt)}</span>
          </div>
          {c.parentId && <p className="text-xs text-vault-gold-soft/40">Reply to a deleted comment</p>}
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-vault-gold-soft/85">{c.text}</p>
          {actions}
          {replyForm}
          {thread}
        </div>
      </div>
    );
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
        {roots.map((c) => (
          <li key={c.id}>{renderComment(c, 0)}</li>
        ))}
        {comments && comments.length === 0 && <EmptyState>{COPY.commentsEmpty}</EmptyState>}
      </ul>
    </div>
  );
}
