import { useAuth } from '../auth/AuthProvider';
import Icon from '../components/Icon';
import { Avatar, Card, EmptyState, ResultPill, WeekStatusPill } from '../components/ui';
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
  const submittedCount = paidPlayerIds.filter((uid) => submittedSet.has(uid)).length;
  const submittedPct = paidPlayerIds.length ? Math.round((submittedCount / paidPlayerIds.length) * 100) : 0;

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
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-vault-gold-soft">{weekLabel(week)}</h2>
            <WeekStatusPill status={week.status} />
          </div>
          {record ? (
            <span className="font-mono text-sm">
              <span className="text-vault-win">{record.w}</span>
              <span className="text-vault-gold-soft/40">-</span>
              <span className="text-vault-loss">{record.l}</span>
              <span className="text-vault-gold-soft/40">-</span>
              <span className="text-sky-400">{record.p}</span>
            </span>
          ) : (
            <span className="text-xs text-vault-gold-soft/60">
              <span className="font-mono text-vault-gold-soft/90">
                {submittedCount}/{paidPlayerIds.length}
              </span>{' '}
              in
            </span>
          )}
        </div>
        {!showFullRoster && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-vault-green-800">
            <div className="h-full rounded-full bg-vault-gold transition-all" style={{ width: `${submittedPct}%` }} />
          </div>
        )}
      </Card>

      {showFullRoster && allPicks ? (
        <Card title="Picks">
          <ul className="flex flex-col divide-y divide-vault-green-700/30">
            {allPicks
              .slice()
              .sort((a, b) => (players[a.id]?.displayName ?? a.id).localeCompare(players[b.id]?.displayName ?? b.id))
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={players[p.id]?.displayName ?? p.id} highlight={p.id === week.bookholderId} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-vault-gold-soft">
                        {p.pickText}{' '}
                        <span className="font-mono text-xs font-normal text-vault-gold-soft/60">{formatOdds(p.americanOdds)}</span>
                      </p>
                      <p className="truncate text-xs text-vault-gold-soft/55">
                        {players[p.id]?.displayName ?? p.id}
                        {p.gameText && ` · ${p.gameText}`}
                      </p>
                    </div>
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
                  <span className="flex items-center gap-3 text-vault-gold-soft/90">
                    <Avatar name={players[uid]?.displayName ?? uid} highlight={uid === week.bookholderId} />
                    {players[uid]?.displayName ?? uid}
                  </span>
                  {submittedSet.has(uid) ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-vault-win">
                      <Icon name="lock" className="h-3.5 w-3.5" />
                      Sealed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-vault-gold-soft/50">
                      <Icon name="clock" className="h-3.5 w-3.5" />
                      Waiting
                    </span>
                  )}
                </li>
              ))}
            {paidPlayerIds.length === 0 && <EmptyState>No one has bought in yet.</EmptyState>}
          </ul>
          {myPick && (
            <p className="mt-4 border-t border-vault-green-700/30 pt-3 text-sm text-vault-gold-soft/70">
              Your pick: <span className="text-vault-gold-soft">{myPick.pickText}</span>{' '}
              <span className="font-mono text-xs">{formatOdds(myPick.americanOdds)}</span>
            </p>
          )}
          <p className="mt-3 text-xs text-vault-gold-soft/55">
            Picks stay hidden until {weekLabel(week)} locks.
          </p>
        </Card>
      )}
    </div>
  );
}
