import { projectedPayouts } from '@vault/shared';
import { useAuth } from '../auth/AuthProvider';
import Podium from '../components/heist/Podium';
import Icon from '../components/Icon';
import { EmptyState } from '../components/ui';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useStandings } from '../hooks/useWeekData';
import { COPY } from '../lib/copy';
import { formatCents, formatUnits } from '../lib/format';

/** Gold, silver and bronze rank rings for the top 3 (SPEC.md §7). */
const MEDAL_CLASS = [
  'bg-vault-gold/15 text-vault-gold ring-1 ring-vault-gold/60',
  'bg-vault-steel-700/40 text-vault-steel-300 ring-1 ring-vault-steel-300/50',
  'bg-amber-900/25 text-amber-500 ring-1 ring-amber-600/50',
];

/** Sharp Standings (SPEC.md §7 screen 4): podium for the top 3, then the full table. */
export default function Standings({ onOpenPlayer }: { onOpenPlayer: (playerId: string) => void }) {
  const { user } = useAuth();
  const { season } = useVaultData();
  const { data: standings } = useStandings(season?.id ?? null);

  if (!season) {
    return <EmptyState>No active season yet.</EmptyState>;
  }

  const rows = standings ?? [];
  const payouts = projectedPayouts(rows, season.vaultCents, season.totalShares, season.sharpPct);
  const sharpLabel = `${Math.round(season.sharpPct * 100)}%`;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-vault-gold">{COPY.sharpTitle}</h1>
        <p className="text-xs text-vault-gold-soft/60">
          Unit leader takes {Math.round(season.sharpPct * 100)}% of the final Vault
        </p>
      </header>

      {standings && rows.length === 0 ? (
        <EmptyState>No one has bought in yet this season.</EmptyState>
      ) : (
        <Podium
          entries={rows.map((s) => ({ id: s.id, name: s.displayName, units: s.units }))}
          {...(user ? { youId: user.uid } : {})}
        />
      )}

      {rows.length > 0 && (
        <ol className="flex flex-col divide-y divide-vault-line rounded-xl border border-vault-line bg-vault-panel px-3">
          {rows.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onOpenPlayer(s.id)}
                className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-vault-gold/5"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs ${MEDAL_CLASS[i] ?? 'text-vault-gold-soft/55'}`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-vault-gold-soft">
                    {s.displayName}
                    {s.id === user?.uid && <span className="text-vault-gold-soft/55"> (you)</span>}
                  </p>
                  <p className="text-xs text-vault-gold-soft/55">
                    <span className="font-mono">
                      {s.wins}-{s.losses}-{s.pushes}
                    </span>{' '}
                    · {s.weeksBoughtIn} {s.weeksBoughtIn === 1 ? 'week' : 'weeks'} bought in
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <span
                    className={`font-mono text-sm ${s.units > 0 ? 'text-vault-win' : s.units < 0 ? 'text-vault-loss' : 'text-vault-gold-soft/60'}`}
                  >
                    {formatUnits(s.units)}
                  </span>
                  {payouts[s.id] && (
                    <span className="font-mono text-xs text-vault-gold">
                      {formatCents(payouts[s.id]!.totalCents)}
                      {payouts[s.id]!.sharpCents > 0 && (
                        <span className="font-sans text-vault-gold-soft/55"> incl. {sharpLabel}</span>
                      )}
                    </span>
                  )}
                </div>
                <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-vault-gold-soft/35" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <p className="text-center text-xs text-vault-gold-soft/55">Units: flat 1u risk per pick. A push counts as 0.</p>
      <p className="text-center text-xs text-vault-gold-soft/55">
        Tap anyone to see their tickets. {COPY.payoutToday}: each player's share of the Vault if the season ended now, with the {sharpLabel} Sharp cut going to
        the unit leader (split while tied). It moves every week with buy-ins and the Book.
      </p>
    </div>
  );
}
