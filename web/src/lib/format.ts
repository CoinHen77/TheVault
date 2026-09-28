import type { TimestampLike, WeekType } from '@vault/shared';

/** CLAUDE.md: money is integer cents everywhere; only format to dollars in the UI. */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Season/week share price is stored in dollars-per-share, displayed to 2 decimals (CLAUDE.md). */
export function formatSharePrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

/** Shares are stored to 6 decimals, displayed to 2 (CLAUDE.md). */
export function formatShares(shares: number): string {
  return shares.toFixed(2);
}

export function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function formatUnits(units: number): string {
  const sign = units > 0 ? '+' : units < 0 ? '−' : '';
  return `${sign}${Math.abs(units).toFixed(2)}u`;
}

const ET_DATE_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

/** All times are stored as Firestore Timestamps and displayed in America/New_York (CLAUDE.md). */
export function formatTimestampET(ts: TimestampLike): string {
  return ET_DATE_TIME.format(ts.toDate());
}

export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return 'locked';
  const totalSeconds = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const WEEK_TYPE_LABEL: Record<WeekType, string> = {
  regular: 'Regular Season',
  wildcard: 'Wild Card',
  divisional: 'Divisional',
  conference: 'Conference Championship',
  superbowl: 'Super Bowl',
};

export function weekLabel(week: { nflWeek: number | null; type: WeekType }): string {
  if (week.type === 'regular') return `Week ${week.nflWeek}`;
  return WEEK_TYPE_LABEL[week.type];
}

export function weekTypeLabel(type: WeekType): string {
  return WEEK_TYPE_LABEL[type];
}
