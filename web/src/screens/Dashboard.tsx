import { useAuth } from '../auth/AuthProvider';
import Countdown from '../components/Countdown';
import Icon from '../components/Icon';
import type { Tab } from '../components/Nav';
import { Card, EmptyState, ResultPill, Stat, WeekStatusPill } from '../components/ui';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useMyBuyIn, useMyPick, useStandings } from '../hooks/useWeekData';
import { formatCents, formatOdds, formatSharePrice, formatShares, weekLabel } from '../lib/format';

export default function Dashboard({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
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
  const myPreloadedCents = myStanding?.preloadedCents ?? 0;
  const preloadMet = myPreloadedCents >= season.requiredPreloadCents;

  const canStillPick = week.status === 'open';
  const needsPick = canStillPick && Boolean(buyIn?.paid) && !pick;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col items-center gap-1 py-4 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-vault-gold-soft/60">Vault balance</p>
        <p className="font-mono text-4xl font-medium tracking-tight text-vault-gold">{formatCents(season.vaultCents)}</p>
        <p className="text-xs text-vault-gold-soft/60">
          Share price <span className="font-mono text-vault-gold-soft/90">{formatSharePrice(season.sharePrice)}</span>
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-vault-green-700/40 bg-vault-green-900/50 p-4">
          <Stat label="Your value" value={formatCents(myValueCents)} />
        </div>
        <div className="rounded-2xl border border-vault-green-700/40 bg-vault-green-900/50 p-4">
          <Stat label="Your shares" value={formatShares(myShares)} />
        </div>
      </div>

      {season.requiredPreloadCents > 0 && (
        <p className={`text-xs ${preloadMet ? 'text-vault-win' : 'text-amber-400'}`}>
          Preload: {formatCents(myPreloadedCents)} of {formatCents(season.requiredPreloadCents)} required
          {!preloadMet && ' — buy-ins are blocked until this is met'}
        </p>
      )}

      <Card accent={needsPick}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-vault-gold-soft">{weekLabel(week)}</h2>
            <WeekStatusPill status={week.status} />
          </div>
          {canStillPick && (
            <span className="flex items-center gap-1 text-xs text-vault-gold">
              <Icon name="lock" className="h-3.5 w-3.5" />
              <span className="font-mono">
                <Countdown lockAt={week.lockAt} />
              </span>
            </span>
          )}
        </div>

        <div className="mt-4 rounded-xl bg-vault-black/40 p-3">
          <p className="text-[11px] uppercase tracking-wide text-vault-gold-soft/60">Your pick</p>
          {pick ? (
            <div className="mt-1 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base text-vault-gold-soft">
                  {pick.pickText}{' '}
                  <span className="font-mono text-sm text-vault-gold-soft/60">{formatOdds(pick.americanOdds)}</span>
                </p>
                {pick.gameText && <p className="truncate text-xs text-vault-gold-soft/55">{pick.gameText}</p>}
              </div>
              <ResultPill result={pick.result} />
            </div>
          ) : needsPick ? (
            <button
              type="button"
              onClick={() => onNavigate('pick')}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-vault-gold px-4 py-2.5 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft"
            >
              Make your pick
              <Icon name="arrowRight" className="h-4 w-4" />
            </button>
          ) : (
            <p className="mt-1 text-sm text-vault-gold-soft/55">
              {canStillPick && !buyIn?.paid ? 'Buy in to make a pick this week.' : 'No pick this week.'}
            </p>
          )}
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-vault-gold-soft/60">Bookholder</dt>
            <dd className="flex items-center gap-2 text-vault-gold-soft/90">
              <Icon name="crown" className="h-4 w-4 text-vault-gold" />
              {bookholderName}
            </dd>
          </div>
          <Row
            label="Your buy-in"
            value={buyIn?.paid ? `Paid · ${formatCents(buyIn.amountCents)}` : `Unpaid · ${formatCents(week.buyInCents)}`}
            tone={buyIn?.paid ? 'good' : 'bad'}
          />
        </dl>
      </Card>
    </div>
  );
}

function Row({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'bad' }) {
  const toneClass = tone === 'good' ? 'text-vault-win' : tone === 'bad' ? 'text-vault-loss' : 'text-vault-gold-soft/90';
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-vault-gold-soft/60">{label}</dt>
      <dd className={toneClass}>{value}</dd>
    </div>
  );
}
