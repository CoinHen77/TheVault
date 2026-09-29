import { Card, EmptyState } from '../components/ui';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useStandings } from '../hooks/useWeekData';
import { formatUnits } from '../lib/format';

/** Gold, silver, bronze rings for the top 3 (SPEC.md §7). */
const MEDAL_CLASS = [
  'bg-vault-gold/20 text-vault-gold ring-1 ring-vault-gold/60',
  'bg-slate-300/15 text-slate-200 ring-1 ring-slate-300/50',
  'bg-amber-700/25 text-amber-500 ring-1 ring-amber-600/50',
];

export default function Standings() {
  const { season } = useVaultData();
  const { data: standings } = useStandings(season?.id ?? null);

  if (!season) {
    return <EmptyState>No active season yet.</EmptyState>;
  }

  return (
    <Card title="Sharp Standings">
      <ul className="flex flex-col divide-y divide-vault-green-700/30">
        {(standings ?? []).map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 py-3">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs ${
                i < 3 ? MEDAL_CLASS[i] : 'text-vault-gold-soft/55'
              }`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-vault-gold-soft">{s.displayName}</p>
              <p className="text-xs text-vault-gold-soft/55">
                <span className="font-mono">
                  {s.wins}-{s.losses}-{s.pushes}
                </span>{' '}
                · {s.weeksBoughtIn} {s.weeksBoughtIn === 1 ? 'week' : 'weeks'} bought in
              </p>
            </div>
            <span className={`font-mono text-sm font-medium ${s.units > 0 ? 'text-vault-win' : s.units < 0 ? 'text-vault-loss' : 'text-vault-gold-soft/60'}`}>
              {formatUnits(s.units)}
            </span>
          </li>
        ))}
        {standings && standings.length === 0 && <EmptyState>No one has bought in yet this season.</EmptyState>}
      </ul>
    </Card>
  );
}
