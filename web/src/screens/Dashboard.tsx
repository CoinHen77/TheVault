import { useAuth } from '../auth/AuthProvider';
import Countdown from '../components/Countdown';
import { Card, EmptyState, ResultPill, Stat, WeekStatusPill } from '../components/ui';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useMyBuyIn, useMyPick, useStandings } from '../hooks/useWeekData';
import { formatCents, formatOdds, formatSharePrice, formatShares, weekLabel } from '../lib/format';

export default function Dashboard() {
  const { user } = useAuth();
  const { season, week, players } = useVaultData();
  const { data: buyIn } = useMyBuyIn(season?.id ?? null, week?.id ?? null, user?.uid ?? null);
  const { data: pick } = useMyPick(season?.id ?? null, week?.id ?? null, user?.uid ?? null);
  const { data: standings } = useStandings(season?.id ?? null);

  if (!season || !week) {
    return <EmptyState>No active season yet. Check back once the Admin sets one up.</EmptyState>;
  }

  const myStanding = standings?.find((s) => s.id === user?.uid);
  const myShares = myStanding?.shares ?? 0;
  const myValueCents = Math.round(myShares * season.sharePrice * 100);
  const bookholderName = players[week.bookholderId]?.displayName ?? week.bookholderId;

  return (
    <div className="flex flex-col gap-4">
      <Card title="The Vault">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Vault balance" value={formatCents(season.vaultCents)} />
          <Stat label="Share price" value={formatSharePrice(season.sharePrice)} />
          <Stat label="Your shares" value={formatShares(myShares)} />
          <Stat label="Your value" value={formatCents(myValueCents)} />
        </div>
      </Card>

      <Card title={weekLabel(week)}>
        <div className="flex items-center justify-between">
          <WeekStatusPill status={week.status} />
          {week.status === 'open' && (
            <span className="text-xs text-vault-gold-soft/50">
              locks in <Countdown lockAt={week.lockAt} />
            </span>
          )}
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Bookholder" value={bookholderName} />
          <Row
            label="Your buy-in"
            value={buyIn?.paid ? `Paid (${formatCents(buyIn.amountCents)})` : `Unpaid (${formatCents(week.buyInCents)})`}
            tone={buyIn?.paid ? 'good' : 'bad'}
          />
          <div className="flex items-start justify-between gap-4">
            <dt className="text-vault-gold-soft/50">Your pick</dt>
            <dd className="text-right">
              {pick ? (
                <span className="flex items-center justify-end gap-2">
                  <span>
                    {pick.pickText} ({formatOdds(pick.americanOdds)})
                  </span>
                  <ResultPill result={pick.result} />
                </span>
              ) : (
                <span className="text-vault-gold-soft/40">Not submitted</span>
              )}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

function Row({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'bad' }) {
  const toneClass = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-red-400' : 'text-vault-gold-soft/90';
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-vault-gold-soft/50">{label}</dt>
      <dd className={toneClass}>{value}</dd>
    </div>
  );
}
