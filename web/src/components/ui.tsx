import type { PickResult, WeekStatus } from '@vault/shared';
import type { ReactNode } from 'react';

/** Shared input styling for the Admin screen's several forms (mirrors SubmitPick/Book's local const). */
export const inputClass =
  'rounded-lg border border-vault-green-700/60 bg-vault-black/40 px-3 py-3 text-sm text-vault-gold-soft outline-none placeholder:text-vault-gold-soft/30 focus:border-vault-gold/60 disabled:opacity-40';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-vault-gold-soft/50">
      {label}
      {children}
    </label>
  );
}

export function Card({ title, children, accent = false }: { title?: string; children: ReactNode; accent?: boolean }) {
  return (
    <section
      className={`rounded-2xl border bg-vault-green-900/50 p-4 ${accent ? 'border-vault-gold/50' : 'border-vault-green-700/40'}`}
    >
      {title && (
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">{title}</h2>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'good' | 'bad' }) {
  const toneClass = tone === 'good' ? 'text-vault-win' : tone === 'bad' ? 'text-vault-loss' : 'text-vault-gold-soft';
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-vault-gold-soft/60">{label}</dt>
      <dd className={`font-mono text-lg font-medium ${toneClass}`}>{value}</dd>
    </div>
  );
}

const WEEK_STATUS_LABEL: Record<WeekStatus, string> = {
  open: 'Open',
  locked: 'Locked',
  grading: 'Grading',
  closed: 'Closed',
};

const WEEK_STATUS_CLASS: Record<WeekStatus, string> = {
  open: 'bg-vault-win/15 text-vault-win border-vault-win/30',
  locked: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  grading: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  closed: 'bg-vault-gold-soft/10 text-vault-gold-soft/60 border-vault-gold-soft/20',
};

export function WeekStatusPill({ status }: { status: WeekStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${WEEK_STATUS_CLASS[status]}`}>
      {WEEK_STATUS_LABEL[status]}
    </span>
  );
}

const RESULT_LABEL: Record<PickResult, string> = {
  pending: 'Pending',
  win: 'Win',
  loss: 'Loss',
  push: 'Push',
};

const RESULT_CLASS: Record<PickResult, string> = {
  pending: 'bg-vault-gold-soft/10 text-vault-gold-soft/60 border-vault-gold-soft/20',
  win: 'bg-vault-win/15 text-vault-win border-vault-win/30',
  loss: 'bg-vault-loss/15 text-vault-loss border-vault-loss/30',
  push: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
};

export function ResultPill({ result }: { result: PickResult }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${RESULT_CLASS[result]}`}>
      {RESULT_LABEL[result]}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-vault-loss/30 bg-vault-loss/10 px-3 py-2 text-sm text-vault-loss">{message}</p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-vault-gold-soft/55">{children}</p>;
}

/** Initials in a circle; gold ring marks someone special (e.g. the Bookholder). */
export function Avatar({ name, highlight = false }: { name: string; highlight?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
        highlight ? 'bg-vault-gold/15 text-vault-gold ring-1 ring-vault-gold/50' : 'bg-vault-green-800 text-vault-gold-soft/80'
      }`}
    >
      {initials || '?'}
    </span>
  );
}
