/**
 * The Odds API feed (SPEC.md §8 Phase 3 "odds lookup", added on request).
 *
 * DraftKings spread, moneyline and total for NFL games, pulled by a scheduled
 * function every 4 hours Tuesday–Friday ET. The free tier is 500 credits a
 * month and each pull costs 1 credit per market (3 here), so the worst month
 * (19 Tue–Fri days × 6 pulls × 3) is 342 credits. The guards below stop pulls
 * well before the limit in case something misfires.
 *
 * The feed only pre-fills the pick form — picks stay free-form text plus odds.
 */
import { isValidAmericanOdds } from './odds.js';
import type { TimestampLike } from './types.js';

export const ODDS_SPORT_KEY = 'americanfootball_nfl';
export const ODDS_BOOKMAKER = 'draftkings';
export const ODDS_MARKETS = ['h2h', 'spreads', 'totals'] as const;

/** One credit per market per region (bookmakers=draftkings counts as one region). */
export const ODDS_CREDITS_PER_PULL = ODDS_MARKETS.length;
/** The Odds API free tier. */
export const ODDS_FREE_TIER_CREDITS = 500;
/** Pulls stop once this many credits are used in an ET calendar month — 50 short of the free tier. */
export const ODDS_MONTHLY_BUDGET = 450;
/** Pulls stop once the API itself reports fewer credits left than this. */
export const ODDS_MIN_REMAINING = 50;
/** The schedule's ceiling: 19 Tue–Fri days (the most a month can have) × 6 pulls. */
export const ODDS_WORST_CASE_MONTH_CREDITS = 19 * 6 * ODDS_CREDITS_PER_PULL;

/** Cron for the scheduled pull: 00, 04, 08, 12, 16, 20 ET, Tuesday–Friday. */
export const ODDS_PULL_SCHEDULE = '0 0,4,8,12,16,20 * * 2-5';
export const ODDS_PULL_TIMEZONE = 'America/New_York';

export type OddsChoice = 'spreadAway' | 'spreadHome' | 'mlAway' | 'mlHome' | 'over' | 'under';

export interface OddsLine {
  odds: number;
  /** Spread or total; null for moneyline. */
  point: number | null;
}

export interface OddsGameBase {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  /** Only the lines DraftKings currently offers are present. */
  lines: Partial<Record<OddsChoice, OddsLine>>;
}

export interface ParsedOddsGame extends OddsGameBase {
  commenceMs: number;
}

/** `odds/feed` — the latest pull, readable by every signed-in player. */
export interface OddsGame extends OddsGameBase {
  commenceAt: TimestampLike;
}

export interface OddsFeed {
  games: OddsGame[];
  pulledAt: TimestampLike;
  bookmaker: string;
}

/** `odds/settings` — Admin kill switch for the scheduled pull. */
export interface OddsSettings {
  paused: boolean;
}

export type OddsCallOutcome = 'ok' | 'error' | 'skipped';

export interface OddsCallLogEntry {
  at: TimestampLike;
  trigger: 'schedule' | 'manual';
  outcome: OddsCallOutcome;
  /** Credits this call cost, from the API's x-requests-last header. */
  credits: number;
  games: number;
  message: string | null;
}

/** `oddsUsage/{YYYY-MM}` — one doc per ET calendar month, Admin-only. */
export interface OddsUsageMonth {
  monthKey: string;
  /** Requests actually sent to The Odds API. */
  calls: number;
  /** Credits charged, summed from x-requests-last. */
  creditsUsed: number;
  errors: number;
  skipped: number;
  /** As last reported by the API (its quota cycle may not match the calendar month). */
  apiUsed: number | null;
  apiRemaining: number | null;
  lastCallAt: TimestampLike | null;
  lastError: string | null;
  lastErrorAt: TimestampLike | null;
  /** Newest first, capped at ODDS_LOG_LENGTH. */
  log: OddsCallLogEntry[];
}

export const ODDS_LOG_LENGTH = 30;

/** "2026-10" for the America/New_York calendar month containing `ms`. */
export function oddsMonthKey(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(ms));
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}`;
}

/** Why a pull must not run, or null if it may. */
export function oddsPullBlockReason(state: {
  paused: boolean;
  monthCreditsUsed: number;
  apiRemaining: number | null;
}): string | null {
  if (state.paused) return 'Paused in the Control room.';
  if (state.monthCreditsUsed + ODDS_CREDITS_PER_PULL > ODDS_MONTHLY_BUDGET) {
    return `This month's ${ODDS_MONTHLY_BUDGET}-credit budget is used up.`;
  }
  if (state.apiRemaining !== null && state.apiRemaining < ODDS_MIN_REMAINING) {
    return `The Odds API reports only ${state.apiRemaining} credits left.`;
  }
  return null;
}

interface RawOutcome {
  name?: unknown;
  price?: unknown;
  point?: unknown;
}

function asLine(outcome: RawOutcome | undefined, needsPoint: boolean): OddsLine | null {
  if (!outcome || typeof outcome.price !== 'number' || !isValidAmericanOdds(outcome.price)) return null;
  if (needsPoint) {
    if (typeof outcome.point !== 'number' || !Number.isFinite(outcome.point)) return null;
    return { odds: outcome.price, point: outcome.point };
  }
  return { odds: outcome.price, point: null };
}

/**
 * Turns The Odds API's `/v4/sports/{sport}/odds` JSON into games with
 * DraftKings lines. Anything malformed is dropped rather than thrown on, so a
 * format change can't take down the Pick screen.
 */
export function parseOddsApiResponse(raw: unknown, bookmakerKey: string = ODDS_BOOKMAKER): ParsedOddsGame[] {
  if (!Array.isArray(raw)) return [];
  const games: ParsedOddsGame[] = [];

  for (const event of raw as Record<string, unknown>[]) {
    if (!event || typeof event !== 'object') continue;
    const { id, home_team: homeTeam, away_team: awayTeam, commence_time: commence } = event;
    if (typeof id !== 'string' || typeof homeTeam !== 'string' || typeof awayTeam !== 'string') continue;
    const commenceMs = typeof commence === 'string' ? Date.parse(commence) : NaN;
    if (!Number.isFinite(commenceMs)) continue;

    const bookmakers = Array.isArray(event.bookmakers) ? (event.bookmakers as Record<string, unknown>[]) : [];
    const book = bookmakers.find((b) => b?.key === bookmakerKey);
    const markets = book && Array.isArray(book.markets) ? (book.markets as Record<string, unknown>[]) : [];
    const outcomesFor = (key: string): RawOutcome[] => {
      const market = markets.find((m) => m?.key === key);
      return market && Array.isArray(market.outcomes) ? (market.outcomes as RawOutcome[]) : [];
    };
    const byName = (outcomes: RawOutcome[], name: string) => outcomes.find((o) => o?.name === name);

    const h2h = outcomesFor('h2h');
    const spreads = outcomesFor('spreads');
    const totals = outcomesFor('totals');

    const candidates: [OddsChoice, OddsLine | null][] = [
      ['spreadAway', asLine(byName(spreads, awayTeam), true)],
      ['spreadHome', asLine(byName(spreads, homeTeam), true)],
      ['mlAway', asLine(byName(h2h, awayTeam), false)],
      ['mlHome', asLine(byName(h2h, homeTeam), false)],
      ['over', asLine(byName(totals, 'Over'), true)],
      ['under', asLine(byName(totals, 'Under'), true)],
    ];
    const lines: Partial<Record<OddsChoice, OddsLine>> = {};
    for (const [choice, line] of candidates) if (line) lines[choice] = line;

    games.push({ eventId: id, homeTeam, awayTeam, commenceMs, lines });
  }

  return games.sort((a, b) => a.commenceMs - b.commenceMs || a.eventId.localeCompare(b.eventId));
}

/** The Odds API's team names → the short codes used in pick text. */
const NFL_TEAM_CODES: Record<string, string> = {
  'Arizona Cardinals': 'ARI',
  'Atlanta Falcons': 'ATL',
  'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF',
  'Carolina Panthers': 'CAR',
  'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN',
  'Cleveland Browns': 'CLE',
  'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN',
  'Detroit Lions': 'DET',
  'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU',
  'Indianapolis Colts': 'IND',
  'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC',
  'Las Vegas Raiders': 'LV',
  'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LAR',
  'Miami Dolphins': 'MIA',
  'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE',
  'New Orleans Saints': 'NO',
  'New York Giants': 'NYG',
  'New York Jets': 'NYJ',
  'Philadelphia Eagles': 'PHI',
  'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF',
  'Seattle Seahawks': 'SEA',
  'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN',
  'Washington Commanders': 'WAS',
};

/** "CHI" for "Chicago Bears"; falls back to the full name for anything unknown. */
export function teamCode(name: string): string {
  return NFL_TEAM_CODES[name] ?? name;
}

/** "Bears" for "Chicago Bears" (every NFL nickname is the last word). */
export function teamNickname(name: string): string {
  return name.trim().split(/\s+/).pop() ?? name;
}

/** "-2.5", "+3", or "PK" for a pick'em spread. */
export function formatSpreadPoint(point: number): string {
  if (point === 0) return 'PK';
  return point > 0 ? `+${point}` : String(point);
}

/** "CHI @ CAR" — away team first. */
export function oddsGameText(game: Pick<OddsGameBase, 'homeTeam' | 'awayTeam'>): string {
  return `${teamCode(game.awayTeam)} @ ${teamCode(game.homeTeam)}`;
}

/** The pick text for one line, e.g. "Bears -2.5", "Bears ML", "Over 47.5". */
export function oddsPickText(game: Pick<OddsGameBase, 'homeTeam' | 'awayTeam'>, choice: OddsChoice, line: OddsLine): string {
  switch (choice) {
    case 'spreadAway':
      return `${teamNickname(game.awayTeam)} ${formatSpreadPoint(line.point ?? 0)}`;
    case 'spreadHome':
      return `${teamNickname(game.homeTeam)} ${formatSpreadPoint(line.point ?? 0)}`;
    case 'mlAway':
      return `${teamNickname(game.awayTeam)} ML`;
    case 'mlHome':
      return `${teamNickname(game.homeTeam)} ML`;
    case 'over':
      return `Over ${line.point}`;
    case 'under':
      return `Under ${line.point}`;
  }
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Games eligible for a week's picks: kicking off at or after lock (SPEC.md
 * §1.1 — only games after 11:00 AM ET Sunday count) and within three days of
 * it, which covers Sunday and Monday night but not next week's slate.
 */
export function eligibleOddsGames<G extends { commenceMs: number }>(games: G[], lockAtMs: number): G[] {
  return games.filter((g) => g.commenceMs >= lockAtMs && g.commenceMs < lockAtMs + THREE_DAYS_MS);
}
