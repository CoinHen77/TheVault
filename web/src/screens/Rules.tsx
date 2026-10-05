import type { WeekType } from '@vault/shared';
import type { ReactNode } from 'react';
import { useVaultData } from '../hooks/VaultDataProvider';
import { COPY } from '../lib/copy';
import { formatCents, weekTypeLabel } from '../lib/format';
import { DEFAULT_BUY_IN_CENTS, WEEK_TYPE_OPTIONS } from '../lib/weekDefaults';

/**
 * The Code: how the pool works, written from SPEC.md §1. The five steps are
 * numbered because they happen in that order every week.
 */
export default function Rules() {
  const { season } = useVaultData();
  const buyIns: Record<WeekType, number> = season?.buyInDefaultsCents ?? DEFAULT_BUY_IN_CENTS;
  const requiredPreloadCents = season?.requiredPreloadCents ?? 0;
  const capPct = Math.round((season?.bookCapPct ?? 0.25) * 100);
  const sharpPct = Math.round((season?.sharpPct ?? 0.1) * 100);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-bold text-vault-gold">{COPY.rules}</h1>
        <p className="text-sm text-vault-gold-soft/60">{COPY.rulesSubtitle}</p>
      </header>

      <p className="text-sm leading-relaxed text-vault-gold-soft/80">
        The Vault is a ledger and scoreboard for our weekly NFL Best Bet pool. It never moves real money. Every buy-in
        is paid offline, and the Admin marks it here once you&apos;ve paid.
      </p>

      <ol className="flex flex-col gap-3">
        {requiredPreloadCents > 0 && (
          <Step n="00" title="Preload once">
            Before you can buy into any week, preload {formatCents(requiredPreloadCents)} into the Vault, once for the
            season. Pay the Admin offline and they&apos;ll mark it. It issues you shares right away, the same as a weekly
            buy-in.
          </Step>
        )}

        <Step n="01" title="Buy in">
          <p>Optional every week, with no season-long commitment. Only paid players can seal a pick that week.</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            {WEEK_TYPE_OPTIONS.map((t) => (
              <li key={t} className="flex items-baseline justify-between gap-2">
                <span className="text-vault-gold-soft/60">{weekTypeLabel(t)}</span>
                <span className="font-mono text-vault-gold-soft">{formatCents(buyIns[t])}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            A buy-in issues you shares at that week&apos;s share price. Your shares are your slice of the Vault.
          </p>
        </Step>

        <Step n="02" title="Seal one Best Bet">
          One pick per week: what you&apos;re betting plus American odds (a whole number, −100 or lower, or +100 or
          higher). The vault opens at 4:00 PM ET on Friday. From then on picks are final, and only games starting
          after that count, so Thursday night is out (honor system). If every paid player has sealed a pick, the
          Admin can open the vault early; the Friday 4:00 PM cutoff still applies. Nobody sees your pick until the
          vault opens.
        </Step>

        <Step n="03" title={`The ${COPY.bookholder} runs the Book`}>
          Once the vault opens, the envelopes unseal and the {COPY.bookholder} can stake up to {capPct}% of that week&apos;s opening Vault, using only
          that week&apos;s picks: straight bets or parlays of any size, split however they like. Whatever the Book wins
          or loses goes straight into the Vault.
        </Step>

        <Step n="04" title="Win the key">
          <p>Every pick is graded win, loss or push. The key for next week&apos;s Book goes to:</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            <li>the longest-odds winning pick;</li>
            <li>if nothing won, the longest-odds push;</li>
            <li>if everything lost, the current {COPY.bookholder} keeps it.</li>
          </ul>
          <p className="mt-1.5">Ties go to more season units, then more weeks bought in, then a coin flip.</p>
        </Step>

        <Step n="05" title="Split the take">
          <p>Units are a flat 1-unit risk per pick:</p>
          <ul className="mt-1.5 space-y-0.5 font-mono text-xs text-vault-gold-soft/80">
            <li>Win at −112 → +0.89u (100 ÷ 112)</li>
            <li>Win at +170 → +1.70u (170 ÷ 100)</li>
            <li>Loss → −1.00u · Push → 0u</li>
          </ul>
          <p className="mt-1.5">
            After the Super Bowl, the unit leader is <span className="text-vault-gold">The Sharp</span> and gets{' '}
            {sharpPct}% of the final Vault. The rest splits by shares.
          </p>
        </Step>
      </ol>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="flex list-none gap-3 rounded-xl border border-vault-line bg-vault-panel px-3.5 py-3">
      <span className="font-mono text-lg leading-6 text-vault-gold" aria-hidden="true">
        {n}
      </span>
      <div className="min-w-0 text-sm leading-relaxed text-vault-gold-soft/75">
        <h2 className="mb-1 text-base font-medium text-vault-gold-soft">{title}</h2>
        {children}
      </div>
    </li>
  );
}
