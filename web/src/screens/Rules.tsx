import type { WeekType } from '@vault/shared';
import { Card } from '../components/ui';
import { useVaultData } from '../hooks/VaultDataProvider';
import { formatCents, weekTypeLabel } from '../lib/format';
import { DEFAULT_BUY_IN_CENTS, WEEK_TYPE_OPTIONS } from '../lib/weekDefaults';

/** Static explainer screen — SPEC.md §1 is the source of truth this is written from. */
export default function Rules() {
  const { season } = useVaultData();
  const buyIns: Record<WeekType, number> = season?.buyInDefaultsCents ?? DEFAULT_BUY_IN_CENTS;
  const requiredPreloadCents = season?.requiredPreloadCents ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Card title="How The Vault works">
        <p className="text-sm text-vault-gold-soft/80">
          The Vault is a ledger and scoreboard for our weekly NFL Best Bet pool — it never moves real money. Every
          buy-in happens offline; the Admin just marks it here once you've paid.
        </p>
      </Card>

      {requiredPreloadCents > 0 && (
        <Card title="Preload">
          <p className="text-sm text-vault-gold-soft/80">
            Before you can buy into any week, you need to preload {formatCents(requiredPreloadCents)} into the Vault
            (once, for the season). Pay the Admin offline and they'll mark it on the Admin screen — you'll show up
            as preloaded there. This preload issues you shares immediately, same as a weekly buy-in.
          </p>
        </Card>
      )}

      <Card title="Buy in each week">
        <p className="mb-3 text-sm text-vault-gold-soft/80">
          Buying in is optional every week — no season-long commitment. Only players whose buy-in is marked paid
          can submit a pick that week. Current buy-in amounts for this season:
        </p>
        <ul className="space-y-1.5 text-sm">
          {WEEK_TYPE_OPTIONS.map((t) => (
            <li key={t} className="flex items-baseline justify-between">
              <span className="text-vault-gold-soft/50">{weekTypeLabel(t)}</span>
              <span className="text-vault-gold-soft/90">{formatCents(buyIns[t])}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-vault-gold-soft/40">
          A buy-in issues you shares of the Vault at that week's share price. Your shares are worth your
          proportional slice of the Vault, and that's what gets paid out when the season ends.
        </p>
      </Card>

      <Card title="Submit your Best Bet">
        <p className="text-sm text-vault-gold-soft/80">
          Each paying player submits exactly one pick per week: a description plus American odds (integers, ≤ −100
          or ≥ +100). Picks lock at 11:00 AM ET on Sunday of that NFL week — only games starting after lock are
          eligible (honor system). Your pick is hidden from everyone else until lock.
        </p>
      </Card>

      <Card title="Grading and units — The Sharp">
        <p className="mb-2 text-sm text-vault-gold-soft/80">
          After lock, the Admin grades every pick win, loss, or push. Units are a flat 1-unit risk per pick:
        </p>
        <ul className="mb-2 space-y-1 text-sm text-vault-gold-soft/70">
          <li>Win, negative odds: 100 / |odds| (e.g. −112 → +0.89u)</li>
          <li>Win, positive odds: odds / 100 (e.g. +170 → +1.70u)</li>
          <li>Loss: −1.00u</li>
          <li>Push: 0u — counts as neither a win nor a loss</li>
        </ul>
        <p className="text-sm text-vault-gold-soft/80">
          Whoever has the most cumulative units through the Super Bowl is <span className="text-vault-gold">The
          Sharp</span> and receives 10% of the final Vault.
        </p>
      </Card>

      <Card title="The Book">
        <p className="mb-2 text-sm text-vault-gold-soft/80">
          Each week has one Bookholder (the Admin holds it for Week 4). After picks lock, the Bookholder can wager
          up to 25% of that week's Opening Vault, using only that week's submitted picks — straight bets or parlays
          of any size, split across as many bets as they want, as long as the total staked stays under the cap.
        </p>
        <p className="text-sm text-vault-gold-soft/80">
          Whatever the Book wins or loses flows straight into the Vault. Who holds the Book next week depends on
          this week's results — check the Book tab for the current cap and bets.
        </p>
      </Card>

      <Card title="End of season">
        <p className="text-sm text-vault-gold-soft/80">
          After the Super Bowl week closes, the Admin finalizes the season: The Sharp is paid their 10%, and
          everyone else's share of the remaining Vault is paid out proportional to the shares they hold.
        </p>
      </Card>
    </div>
  );
}
