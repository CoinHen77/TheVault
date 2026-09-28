import type { PickResult, WeekStatus } from '@vault/shared';
import type { ReactNode } from 'react';

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-vault-green-700/40 bg-vault-green-900/60 p-4">
      {title && (
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-vault-gold-soft/50">{title}</h2>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'good' | 'bad' }) {
  const toneClass = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-red-400' : 'text-vault-gold';
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-vault-gold-soft/50">{label}</dt>
      <dd className={`text-lg font-semibold ${toneClass}`}>{value}</dd>
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
  open: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
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
  win: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  loss: 'bg-red-500/15 text-red-400 border-red-500/30',
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
    <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{message}</p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-vault-gold-soft/40">{children}</p>;
}
