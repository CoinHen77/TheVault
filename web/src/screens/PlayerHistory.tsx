import { useState } from 'react';
import { projectedPayouts, summarizePickHistory, type Pick as PickDoc, type Week } from '@vault/shared';
import { useAuth } from '../auth/AuthProvider';
import PickTicket from '../components/heist/PickTicket';
import Icon from '../components/Icon';
import { Avatar, EmptyState } from '../components/ui';
import { useVaultData } from '../hooks/VaultDataProvider';
import { usePlayerWeekPicks, useStandings, useWeeks } from '../hooks/useWeekData';
import { COPY } from '../lib/copy';
import { formatCents, formatOdds, formatUnits, weekLabel } from '../lib/format';

type WithId<T> = T & { id: string };

/**
 * A player's page (added 2026-11-16), opened from the Sharp, the Week tickets
 * or your season line on Home: their season line, a units-over-time chart and
 * every ticket, newest first. The open week shows only on your own page, as a
 * sealed ticket; everyone else's stays hidden until the vault opens.
 */
export default function PlayerHistory({
  playerId,
  onBack,
  backLabel,
}: {
  playerId: string;
  onBack: () => void;
  backLabel: string;
}) {
  const { user } = useAuth();
  const { season, week: currentWeek, players } = useVaultData();
  const seasonId = season?.id ?? null;
  const isYou = playerId === user?.uid;

  const { data: weeks } = useWeeks(seasonId);
  const { data: standings } = useStandings(seasonId);
  const currentOrder = currentWeek?.order ?? Infinity;
  const shownWeeks = (weeks ?? []).filter((w) => w.order <= currentOrder && (w.status !== 'open' || isYou));
  const { picks, legs, loading } = usePlayerWeekPicks(
    seasonId,
    shownWeeks.map((w) => w.id),
    playerId,
  );

  if (!season) return <EmptyState>No active season yet.</EmptyState>;

  const name = players[playerId]?.displayName ?? playerId;
  const rank = (standings ?? []).findIndex((s) => s.id === playerId);
  const standing = rank >= 0 ? standings![rank]! : null;
  const payout = projectedPayouts(standings ?? [], season.vaultCents, season.totalShares, season.sharpPct)[playerId];

  const withPicks = shownWeeks.flatMap((w) => {
    const p = picks[w.id];
    return p ? [{ week: w, pick: p }] : [];
  });
  const summary = summarizePickHistory(
    withPicks.map(({ week, pick }) => ({ weekId: week.id, americanOdds: pick.americanOdds, result: pick.result, units: pick.units })),
  );
  const bestHit = summary.bestHit ? withPicks.find((x) => x.week.id === summary.bestHit!.weekId) : null;
  const keyWeeks = (weeks ?? []).filter((w) => w.order <= currentOrder && w.bookholderId === playerId).length;
  const weekById = new Map((weeks ?? []).map((w) => [w.id, w]));

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 flex min-h-11 items-center gap-1 self-start rounded-lg px-1 text-sm text-vault-gold-soft/70 transition hover:text-vault-gold"
      >
        <Icon name="arrowRight" className="h-4 w-4 rotate-180" />
        {backLabel}
      </button>

      <header className="flex items-center gap-3">
        <Avatar name={name} highlight={currentWeek?.bookholderId === playerId} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold text-vault-gold">
            {name}
            {isYou && <span className="font-sans text-base font-normal text-vault-gold-soft/55"> (you)</span>}
          </h1>
          {standing && (
            <p className="text-xs text-vault-gold-soft/60">
              {ordinal(rank + 1)} in {COPY.sharpTitle}
            </p>
          )}
        </div>
      </header>

      {standing ? (
        <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Record" value={`${standing.wins}-${standing.losses}-${standing.pushes}`} />
          <Stat label="Units" value={formatUnits(standing.units)} tone={unitsTone(standing.units)} />
          <Stat label="Weeks in" value={String(standing.weeksBoughtIn)} />
          <Stat
            label={COPY.payoutToday}
            value={payout ? formatCents(payout.totalCents) : '—'}
            tone="text-vault-gold"
            {...(payout && payout.sharpCents > 0 ? { note: `incl. ${Math.round(season.sharpPct * 100)}% Sharp` } : {})}
          />
        </dl>
      ) : (
        <EmptyState>{isYou ? "You haven't" : `${name} hasn't`} bought in this season yet.</EmptyState>
      )}

      {standing && (
        <dl className="grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-3">
          <Fact
            label="Best hit"
            value={bestHit ? `${bestHit.pick.pickText} ${formatOdds(bestHit.pick.americanOdds)}` : 'No wins yet'}
          />
          <Fact
            label="Streak"
            value={summary.streak ? `${summary.streak.count} ${STREAK_WORD[summary.streak.result]}` : '—'}
          />
          <Fact label="Held the key" value={`${keyWeeks} ${keyWeeks === 1 ? 'week' : 'weeks'}`} />
        </dl>
      )}

      {summary.cumulative.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-vault-line bg-vault-panel px-3 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">Units over the season</h2>
          <UnitsChart
            points={summary.cumulative.map((c) => {
              const w = weekById.get(c.weekId);
              return { label: w ? weekLabel(w) : c.weekId, units: c.units };
            })}
          />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">Tickets</h2>
        {loading && withPicks.length === 0 ? (
          <EmptyState>Opening the envelopes…</EmptyState>
        ) : shownWeeks.length === 0 ? (
          <EmptyState>No weeks to show yet.</EmptyState>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {shownWeeks
              .slice()
              .reverse()
              .map((w) => (
                <TicketRow
                  key={w.id}
                  week={w}
                  pick={picks[w.id]}
                  usedInBook={Boolean(legs[w.id]?.includes(playerId))}
                  earnedKey={w.status === 'closed' && w.nextBookholderId === playerId && w.bookDecision?.rule !== 'all_losses_keep'}
                />
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const STREAK_WORD = { win: 'W in a row', loss: 'L in a row', push: 'P in a row' } as const;

function TicketRow({
  week,
  pick,
  usedInBook,
  earnedKey,
}: {
  week: WithId<Week>;
  /** undefined while loading; null if they sat the week out. */
  pick: PickDoc | null | undefined;
  usedInBook: boolean;
  earnedKey: boolean;
}) {
  if (pick === undefined) return null; // still loading
  if (pick === null) {
    return (
      <li className="flex items-center justify-between rounded-xl border border-dashed border-vault-steel-700 px-4 py-3 text-sm text-vault-gold-soft/55">
        <span>{weekLabel(week)}</span>
        <span>Sat out</span>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-1">
      <PickTicket pick={pick} week={week} sealed={week.status === 'open'} usedInBook={usedInBook} />
      {earnedKey && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-vault-gold">
          <Icon name="key" className="h-3.5 w-3.5" />
          {COPY.earnedKeyHere}
        </p>
      )}
    </li>
  );
}

/**
 * Running season units, one point per graded week, with a zero line. Tap or
 * hover a point to read it; the ticket list below is the full table.
 */
function UnitsChart({ points }: { points: { label: string; units: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 320;
  const H = 120;
  const PAD = { x: 10, y: 12 };
  const values = points.map((p) => p.units);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : PAD.x + (i * (W - 2 * PAD.x)) / (points.length - 1));
  const y = (v: number) => PAD.y + ((max - v) * (H - 2 * PAD.y)) / span;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.units).toFixed(1)}`).join(' ');
  const shown = active ?? points.length - 1;
  const focus = points[shown]!;

  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-baseline justify-between text-xs text-vault-gold-soft/60">
        <span>{focus.label}</span>
        <span className={`font-mono text-sm ${unitsTone(focus.units)}`}>{formatUnits(focus.units)}</span>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full overflow-visible"
        role="img"
        aria-label={`Season units by week: ${points.map((p) => `${p.label} ${formatUnits(p.units)}`).join(', ')}`}
        onMouseLeave={() => setActive(null)}
      >
        <line
          x1={0}
          x2={W}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--color-vault-steel-700)"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path}
          fill="none"
          stroke="var(--color-vault-gold)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={x(i)}
              cy={y(p.units)}
              r={i === shown ? 5 : 4}
              fill={i === shown ? 'var(--color-vault-gold)' : 'var(--color-vault-panel)'}
              stroke="var(--color-vault-gold)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x(i)}
              cy={y(p.units)}
              r={14}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
            />
          </g>
        ))}
      </svg>
      <p className="flex justify-between text-[11px] text-vault-gold-soft/45">
        <span>{points[0]!.label}</span>
        {points.length > 1 && <span>{points.at(-1)!.label}</span>}
      </p>
    </div>
  );
}

function Stat({ label, value, tone, note }: { label: string; value: string; tone?: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-vault-line bg-vault-panel px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-vault-gold-soft/60">{label}</dt>
      <dd className={`font-mono text-base ${tone ?? 'text-vault-gold-soft'}`}>{value}</dd>
      {note && <dd className="text-[11px] text-vault-gold-soft/55">{note}</dd>}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-xl border border-vault-line px-3 py-2 min-[420px]:flex-col min-[420px]:items-start min-[420px]:gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-vault-gold-soft/60">{label}</dt>
      <dd className="truncate text-right text-vault-gold-soft min-[420px]:text-left">{value}</dd>
    </div>
  );
}

function unitsTone(units: number): string {
  return units > 0 ? 'text-vault-win' : units < 0 ? 'text-vault-loss' : 'text-vault-gold-soft/90';
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
