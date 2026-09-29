import { useAuth } from '../auth/AuthProvider';
import Podium from '../components/heist/Podium';
import { EmptyState } from '../components/ui';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useStandings } from '../hooks/useWeekData';
import { COPY } from '../lib/copy';
import { formatUnits } from '../lib/format';

/** Gold, silver and bronze rank rings for the top 3 (SPEC.md §7). */
const MEDAL_CLASS = [
  'bg-vault-gold/15 text-vault-gold ring-1 ring-vault-gold/60',
  'bg-vault-steel-700/40 text-vault-steel-300 ring-1 ring-vault-steel-300/50',
  'bg-amber-900/25 text-amber-500 ring-1 ring-amber-600/50',
];

/** Sharp Standings (SPEC.md §7 screen 4): podium for the top 3, then the full table. */
export default function Standings() {
  const { user } = useAuth();
  const { season } = useVaultData();
  const { data: standings } = useStandings(season?.id ?? null);

  if (!season) {
    return <EmptyState>No active season yet.</EmptyState>;
  }

  const rows = standings ?? [];

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
            <li key={s.id} className="flex items-center gap-3 py-3">
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
              <span
                className={`font-mono text-sm ${s.units > 0 ? 'text-vault-win' : s.units < 0 ? 'text-vault-loss' : 'text-vault-gold-soft/60'}`}
              >
                {formatUnits(s.units)}
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="text-center text-xs text-vault-gold-soft/55">Units: flat 1u risk per pick. A push counts as 0.</p>
    </div>
  );
}
