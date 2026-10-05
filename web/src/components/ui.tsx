import type { PickResult, WeekStatus } from '@vault/shared';
import { createContext, use, type ReactNode } from 'react';
import { COPY } from '../lib/copy';

/**
 * Shared input styling for the Control room's forms (mirrors SubmitPick/Book's
 * local const). 16px text so iOS Safari doesn't zoom in on focus.
 */
export const inputClass =
  'min-h-11 rounded-lg border border-vault-steel-700 bg-vault-black/40 px-3 py-2.5 text-base normal-case tracking-normal text-vault-gold-soft outline-none placeholder:text-vault-gold-soft/35 focus:border-vault-gold/60 disabled:opacity-40';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.12em] text-vault-gold-soft/60">
      {label}
      {children}
    </label>
  );
}

/** True inside a ToolPanel, which already draws the frame and title. */
const PlainCardContext = createContext(false);

export function Card({ title, children, accent = false }: { title?: string; children: ReactNode; accent?: boolean }) {
  if (use(PlainCardContext)) return <div className="flex flex-col">{children}</div>;
  return (
    <section
      className={`rounded-2xl border bg-vault-panel p-4 ${accent ? 'border-vault-gold/50' : 'border-vault-line'}`}
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

const WEEK_STATUS_LABEL: Record<WeekStatus, string> = COPY.weekStatus;

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

/**
 * A collapsible Control room tool (CLAUDE.md H5): a native <details> so it's
 * keyboard- and screen-reader-friendly with no extra state. Cards inside it
 * render without their own frame and title.
 */
export function ToolPanel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-vault-line bg-vault-panel">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-col">
          <span className="text-sm font-medium text-vault-gold-soft">{title}</span>
          {hint && <span className="text-xs text-vault-gold-soft/55">{hint}</span>}
        </span>
        <span aria-hidden="true" className="text-vault-gold-soft/55 transition group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t border-vault-line px-4 py-4">
        <PlainCardContext value={true}>{children}</PlainCardContext>
      </div>
    </details>
  );
}
