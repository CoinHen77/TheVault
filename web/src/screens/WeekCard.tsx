import { useAuth } from '../auth/AuthProvider';
import { Card, EmptyState, ResultPill, WeekStatusPill } from '../components/ui';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useBuyIns, useMyPick, usePicks } from '../hooks/useWeekData';
import { formatOdds, weekLabel } from '../lib/format';

export default function WeekCard() {
  const { user } = useAuth();
  const { season, week, players } = useVaultData();
  const { data: buyIns } = useBuyIns(season?.id ?? null, week?.id ?? null);
  const { data: myPick } = useMyPick(season?.id ?? null, week?.id ?? null, user?.uid ?? null);

  const showFullRoster = Boolean(week) && week!.status !== 'open';
  const { data: allPicks } = usePicks(season?.id ?? null, week?.id ?? null, showFullRoster);

  if (!season || !week) {
    return <EmptyState>No active season yet.</EmptyState>;
  }

  const paidPlayerIds = (buyIns ?? []).filter((b) => b.paid).map((b) => b.id);
  const submittedSet = new Set(week.submittedPlayerIds);

  const record = allPicks
    ? allPicks.reduce(
        (acc, p) => {
          if (p.result === 'win') acc.w += 1;
          else if (p.result === 'loss') acc.l += 1;
          else if (p.result === 'push') acc.p += 1;
          return acc;
        },
        { w: 0, l: 0, p: 0 },
      )
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Card title={weekLabel(week)}>
        <div className="flex items-center justify-between">
          <WeekStatusPill status={week.status} />
          {record && (
            <span className="text-sm text-vault-gold-soft/70">
              {record.w}-{record.l}-{record.p}
            </span>
          )}
        </div>
      </Card>

      {showFullRoster && allPicks ? (
        <Card title="Picks">
          <ul className="flex flex-col divide-y divide-vault-green-700/30">
            {allPicks
              .slice()
              .sort((a, b) => (players[a.id]?.displayName ?? a.id).localeCompare(players[b.id]?.displayName ?? b.id))
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-vault-gold-soft">
                      {players[p.id]?.displayName ?? p.id}
                    </p>
                    <p className="truncate text-xs text-vault-gold-soft/50">
                      {p.pickText} · {p.gameText} · {formatOdds(p.americanOdds)}
                    </p>
                  </div>
                  <ResultPill result={p.result} />
                </li>
              ))}
            {allPicks.length === 0 && <EmptyState>No picks were submitted this week.</EmptyState>}
          </ul>
        </Card>
      ) : (
        <Card title="Who's submitted">
          <ul className="flex flex-col divide-y divide-vault-green-700/30">
            {paidPlayerIds
              .slice()
              .sort((a, b) => (players[a]?.displayName ?? a).localeCompare(players[b]?.displayName ?? b))
              .map((uid) => (
                <li key={uid} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-vault-gold-soft/90">{players[uid]?.displayName ?? uid}</span>
                  {submittedSet.has(uid) ? (
                    <span className="text-xs font-medium text-emerald-400">Submitted</span>
                  ) : (
                    <span className="text-xs text-vault-gold-soft/30">Waiting</span>
                  )}
                </li>
              ))}
            {paidPlayerIds.length === 0 && <EmptyState>No one has bought in yet.</EmptyState>}
          </ul>
          {myPick && (
            <p className="mt-4 border-t border-vault-green-700/30 pt-3 text-sm text-vault-gold-soft/70">
              Your pick: <span className="text-vault-gold-soft">{myPick.pickText}</span> ({formatOdds(myPick.americanOdds)})
            </p>
          )}
          <p className="mt-3 text-xs text-vault-gold-soft/40">
            Picks stay hidden until {weekLabel(week)} locks.
          </p>
        </Card>
      )}
    </div>
  );
}
