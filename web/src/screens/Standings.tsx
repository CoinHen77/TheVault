import { Card, EmptyState } from '../components/ui';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useStandings } from '../hooks/useWeekData';
import { formatUnits } from '../lib/format';

const MEDALS = ['🥇', '🥈', '🥉'];

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
            <span className="w-6 shrink-0 text-center text-sm text-vault-gold-soft/50">
              {i < 3 ? MEDALS[i] : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-vault-gold-soft">{s.displayName}</p>
              <p className="text-xs text-vault-gold-soft/50">
                {s.wins}-{s.losses}-{s.pushes} · {s.weeksBoughtIn} weeks bought in
              </p>
            </div>
            <span className={`text-sm font-semibold ${s.units > 0 ? 'text-emerald-400' : s.units < 0 ? 'text-red-400' : 'text-vault-gold-soft/60'}`}>
              {formatUnits(s.units)}
            </span>
          </li>
        ))}
        {standings && standings.length === 0 && <EmptyState>No one has bought in yet this season.</EmptyState>}
      </ul>
    </Card>
  );
}
