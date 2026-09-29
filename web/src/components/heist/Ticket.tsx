import type { ReactNode } from 'react';

/**
 * A betting-slip card: pick on top, a torn-edge line with side notches, then
 * the numbers. `mark` sits in the top-right corner (a WaxSeal or ResultStamp).
 * `notchClassName` must match the background the ticket sits on so the
 * notches read as cut-outs.
 */
export default function Ticket({
  eyebrow,
  title,
  subtitle,
  footer,
  mark,
  muted = false,
  notchClassName = 'bg-vault-black',
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  mark?: ReactNode;
  muted?: boolean;
  notchClassName?: string | undefined;
}) {
  const notchBorder = muted ? 'border-vault-line' : 'border-vault-brass';
  return (
    <article
      className={`relative rounded-xl border bg-vault-panel px-3.5 py-3 ${muted ? 'border-vault-line' : 'border-vault-brass'}`}
    >
      {mark && <div className="absolute right-3 top-3">{mark}</div>}
      {eyebrow && (
        <p className="pr-20 font-mono text-[11px] uppercase tracking-wider text-vault-gold-soft/60">{eyebrow}</p>
      )}
      <p className={`${mark ? 'pr-20' : ''} text-lg leading-snug text-vault-gold-soft ${eyebrow ? 'mt-1' : ''}`}>{title}</p>
      {subtitle && <p className="text-xs text-vault-gold-soft/60">{subtitle}</p>}
      {footer && (
        <>
          <div className="relative -mx-3.5 my-2.5" aria-hidden="true">
            <div className="border-t-[1.5px] border-dashed border-vault-steel-700" />
            <span
              className={`absolute -left-[7px] -top-[7px] h-3.5 w-3.5 rounded-full border ${notchBorder} ${notchClassName}`}
            />
            <span
              className={`absolute -right-[7px] -top-[7px] h-3.5 w-3.5 rounded-full border ${notchBorder} ${notchClassName}`}
            />
          </div>
          {footer}
        </>
      )}
    </article>
  );
}

/** A label-over-value pair for a ticket's footer row. */
export function TicketStat({
  label,
  value,
  tone = 'default',
  align = 'left',
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'good' | 'bad';
  align?: 'left' | 'right';
}) {
  const toneClass = tone === 'good' ? 'text-vault-win' : tone === 'bad' ? 'text-vault-loss' : 'text-vault-gold-soft';
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="text-[11px] uppercase tracking-[0.12em] text-vault-gold-soft/60">{label}</p>
      <p className={`font-mono text-base ${toneClass}`}>{value}</p>
    </div>
  );
}
