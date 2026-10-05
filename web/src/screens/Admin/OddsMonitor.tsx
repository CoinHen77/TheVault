import { httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import {
  ODDS_CREDITS_PER_PULL,
  ODDS_FEED_DOC_IDS,
  ODDS_FREE_TIER_CREDITS,
  ODDS_MIN_REMAINING,
  ODDS_MONTHLY_BUDGET,
  ODDS_SPORT_LABELS,
  ODDS_SPORTS,
  ODDS_WORST_CASE_MONTH_CREDITS,
  oddsMonthKey,
  type OddsFeed,
  type OddsSettings,
  type OddsSport,
  type OddsUsageMonth,
} from '@vault/shared';
import { Card, ErrorBanner, Stat } from '../../components/ui';
import { useCollectionData } from '../../hooks/useCollectionData';
import { useDocData } from '../../hooks/useDocData';
import { functions } from '../../lib/firebase';
import { formatTimestampET } from '../../lib/format';

const pullOddsNow = httpsCallable<{ sport: OddsSport }, { outcome: string; games: number; credits: number; message: string | null }>(
  functions,
  'pullOddsNow',
);
const setOddsPaused = httpsCallable<{ paused: boolean }, void>(functions, 'setOddsPaused');

/** "N credits this month · M errors" for the ToolPanel hint, so trouble shows while it's collapsed. */
export function useOddsMonitorHint(): string {
  const { data: usage } = useDocData<OddsUsageMonth>(`oddsUsage/${oddsMonthKey(Date.now())}`);
  const used = usage?.creditsUsed ?? 0;
  const errors = usage?.errors ?? 0;
  return `${used} / ${ODDS_FREE_TIER_CREDITS} credits this month${errors ? ` · ${errors} error${errors === 1 ? '' : 's'}` : ''}`;
}

/**
 * Credit usage for The Odds API's free tier (500 credits/month). Counts come
 * from the API's own usage headers, recorded by the pullOdds functions in
 * `oddsUsage/{YYYY-MM}`.
 */
export default function OddsMonitor() {
  const monthKey = oddsMonthKey(Date.now());
  const { data: usage } = useDocData<OddsUsageMonth>(`oddsUsage/${monthKey}`);
  const { data: settings } = useDocData<OddsSettings>('odds/settings');
  const { data: nflFeed } = useDocData<OddsFeed>(`odds/${ODDS_FEED_DOC_IDS.nfl}`);
  const { data: ncaafFeed } = useDocData<OddsFeed>(`odds/${ODDS_FEED_DOC_IDS.ncaaf}`);
  const feeds: Record<OddsSport, OddsFeed | null | undefined> = { nfl: nflFeed, ncaaf: ncaafFeed };
  const { data: months } = useCollectionData<OddsUsageMonth>('oddsUsage');

  const [busy, setBusy] = useState<OddsSport | 'pause' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const used = usage?.creditsUsed ?? 0;
  const paused = settings?.paused ?? false;
  const pct = Math.min(100, (used / ODDS_FREE_TIER_CREDITS) * 100);
  const budgetPct = (ODDS_MONTHLY_BUDGET / ODDS_FREE_TIER_CREDITS) * 100;
  const barTone = used >= ODDS_MONTHLY_BUDGET ? 'bg-vault-loss' : used >= ODDS_MONTHLY_BUDGET * 0.8 ? 'bg-amber-400' : 'bg-vault-win';
  const pastMonths = (months ?? []).filter((m) => m.id !== monthKey).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 6);

  async function run(kind: OddsSport | 'pause', action: () => Promise<string | null>) {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      setNote(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Odds feed">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-2xl text-vault-gold-soft">
              {used}
              <span className="text-base text-vault-gold-soft/50"> / {ODDS_FREE_TIER_CREDITS}</span>
            </p>
            <p className="text-xs text-vault-gold-soft/55">credits used in {monthKey}</p>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-vault-black/50" aria-hidden="true">
            <div className={`h-full ${barTone}`} style={{ width: `${pct}%` }} />
            <div className="absolute inset-y-0 w-px bg-vault-gold-soft/60" style={{ left: `${budgetPct}%` }} />
          </div>
          <p className="text-xs text-vault-gold-soft/55">
            Pulls stop at {ODDS_MONTHLY_BUDGET} (the line), or if the API reports under {ODDS_MIN_REMAINING} left. The
            schedule uses at most {ODDS_WORST_CASE_MONTH_CREDITS} a month.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Calls" value={usage?.calls ?? 0} />
          <Stat label="Errors" value={usage?.errors ?? 0} tone={usage?.errors ? 'bad' : 'default'} />
          <Stat label="Skipped" value={usage?.skipped ?? 0} />
          <Stat label="API says left" value={usage?.apiRemaining ?? '—'} />
        </dl>

        {usage?.lastError && usage.lastErrorAt && (
          <ErrorBanner message={`Last error (${formatTimestampET(usage.lastErrorAt)}): ${usage.lastError}`} />
        )}

        <div className="flex flex-col gap-1 text-xs text-vault-gold-soft/60">
          <p>
            Schedule, Tue–Fri ET while a week is open: NFL every 4 hours, college once a day at 10 AM.{' '}
            {paused ? <span className="text-amber-400">Paused.</span> : <span className="text-vault-win">Running.</span>}
          </p>
          {ODDS_SPORTS.map((sport) => {
            const feed = feeds[sport];
            return (
              <p key={sport}>
                Last {ODDS_SPORT_LABELS[sport]} pull:{' '}
                {feed ? `${formatTimestampET(feed.pulledAt)} · ${feed.games.length} games` : 'never'}
              </p>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {ODDS_SPORTS.map((sport) => (
            <button
              key={sport}
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run(sport, async () => {
                  const { data } = await pullOddsNow({ sport });
                  if (data.outcome === 'ok') return `Pulled ${data.games} ${ODDS_SPORT_LABELS[sport]} games for ${data.credits} credits.`;
                  return `${data.outcome === 'skipped' ? 'Skipped' : 'Failed'}: ${data.message ?? ''}`;
                })
              }
              className="min-h-11 rounded-lg bg-vault-gold px-4 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
            >
              {busy === sport ? 'Pulling…' : `Pull ${ODDS_SPORT_LABELS[sport]} (${ODDS_CREDITS_PER_PULL} cr)`}
            </button>
          ))}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void run('pause', async () => {
                await setOddsPaused({ paused: !paused });
                return null;
              })
            }
            className="min-h-11 rounded-lg border border-vault-steel-700 px-4 text-sm text-vault-gold-soft transition hover:border-vault-gold/60 disabled:opacity-40"
          >
            {paused ? 'Resume schedule' : 'Pause schedule'}
          </button>
        </div>
        {error && <ErrorBanner message={error} />}
        {note && <p className="text-sm text-vault-gold-soft/80">{note}</p>}

        <details className="text-xs">
          <summary className="min-h-11 cursor-pointer py-3 text-vault-gold-soft/70">Recent calls</summary>
          {usage?.log?.length ? (
            <ul className="flex flex-col divide-y divide-vault-line">
              {usage.log.map((entry, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
                  <span className="text-vault-gold-soft/70">
                    {formatTimestampET(entry.at)} · {ODDS_SPORT_LABELS[entry.sport ?? 'nfl']} ·{' '}
                    {entry.trigger === 'manual' ? 'Pull now' : 'Schedule'}
                  </span>
                  <span
                    className={
                      entry.outcome === 'ok'
                        ? 'text-vault-win'
                        : entry.outcome === 'error'
                          ? 'text-vault-loss'
                          : 'text-vault-gold-soft/55'
                    }
                  >
                    {entry.outcome === 'ok' ? `${entry.games} games` : entry.outcome}
                    <span className="font-mono"> · {entry.credits} cr</span>
                  </span>
                  {entry.message && <span className="w-full text-vault-gold-soft/55">{entry.message}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-vault-gold-soft/55">No calls yet this month.</p>
          )}
        </details>

        {pastMonths.length > 0 && (
          <details className="text-xs">
            <summary className="min-h-11 cursor-pointer py-3 text-vault-gold-soft/70">Past months</summary>
            <ul className="flex flex-col divide-y divide-vault-line">
              {pastMonths.map((m) => (
                <li key={m.id} className="flex justify-between gap-3 py-1.5 font-mono text-vault-gold-soft/70">
                  <span>{m.id}</span>
                  <span>
                    {m.creditsUsed} cr · {m.calls} calls · {m.errors} err
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}
