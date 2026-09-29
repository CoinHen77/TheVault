import { COPY } from '../../lib/copy';
import { formatCents } from '../../lib/format';

/**
 * How much of this week's Book cap is staked. Display only: the cap itself is
 * `bookCapCents`, set server-side at lock (SPEC.md §1.3).
 */
export default function CapRing({ usedCents, capCents }: { usedCents: number; capCents: number }) {
  const r = 32;
  const circumference = 2 * Math.PI * r;
  const fraction = capCents > 0 ? Math.min(1, usedCents / capCents) : 0;
  const pct = Math.round(fraction * 100);
  const full = capCents > 0 && usedCents >= capCents;

  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-vault-brass bg-vault-panel px-3 py-3">
      <svg viewBox="0 0 80 80" width="72" height="72" className="shrink-0" role="img" aria-label={`${pct}% of the cap used`}>
        <circle cx="40" cy="40" r={r} fill="none" className="stroke-vault-line" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          className={full ? 'stroke-vault-loss' : 'stroke-vault-gold'}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform="rotate(-90 40 40)"
        />
        <text x="40" y="44.5" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="13" className="fill-vault-gold">
          {pct}%
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.12em] text-vault-gold-soft/60">{COPY.capTaken}</p>
        <p className="font-mono text-lg text-vault-gold-soft">
          {formatCents(usedCents)} <span className="text-sm text-vault-gold-soft/55">/ {formatCents(capCents)}</span>
        </p>
        <p className="text-xs text-vault-gold-soft/60">
          {full ? 'Cap reached' : `${formatCents(capCents - usedCents)} left to stake`}
        </p>
      </div>
    </div>
  );
}
