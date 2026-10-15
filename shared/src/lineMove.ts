/**
 * Line moves (SPEC.md §1.3). A pick sealed from the odds board remembers
 * which DraftKings line it came from. Each odds pull compares the sealed price
 * with the current one, and while the vault is sealed the player gets one push
 * if it moved enough to matter, so they can reseal or change their pick.
 *
 * When the vault opens, every linked pick is re-priced to the line DraftKings
 * offers at that moment, including a moved spread or total (priceAtOpen).
 * Units and the key decision use that price; the original seal is kept in
 * `Pick.sealed`.
 */
import { ODDS_SPORTS, oddsPickText, type OddsChoice, type OddsGameBase, type OddsLine, type OddsSport } from './oddsFeed.js';
import type { TimestampLike } from './types.js';

const ODDS_CHOICES: OddsChoice[] = ['spreadAway', 'spreadHome', 'mlAway', 'mlHome', 'over', 'under'];

/** `Pick.line`: the board line a pick was sealed from. */
export interface PickLine {
  sport: OddsSport;
  eventId: string;
  choice: OddsChoice;
  /** Spread or total at sealing; null for moneyline. */
  point: number | null;
}

/** `Pick.lineNow`: the latest DraftKings price for that line (server-only). */
export interface PickLineNow {
  odds: number;
  point: number | null;
  /** The pick text at this line, e.g. "Bears -3". */
  pickText: string;
  checkedAt: TimestampLike;
}

/** `Pick.sealed`: what the player sealed, kept once the pick is re-priced at vault open. */
export interface PickSealed {
  pickText: string;
  americanOdds: number;
  point: number | null;
}

/** An odds-only move of this many cents or more (e.g. −110 → −115) is worth an alert. Any point change always is. */
export const LINE_MOVE_ALERT_CENTS = 5;

/** True if `value` is a well-formed PickLine (used to validate what the client sends). */
export function isPickLine(value: unknown): value is PickLine {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sport === 'string' &&
    (ODDS_SPORTS as string[]).includes(v.sport) &&
    typeof v.eventId === 'string' &&
    v.eventId.length > 0 &&
    v.eventId.length <= 100 &&
    typeof v.choice === 'string' &&
    (ODDS_CHOICES as string[]).includes(v.choice) &&
    (v.point === null || (typeof v.point === 'number' && Number.isFinite(v.point))) &&
    Object.keys(v).every((k) => ['sport', 'eventId', 'choice', 'point'].includes(k))
  );
}

/**
 * American odds on one straight scale, so −105 → +105 is 10 cents, the same
 * as −110 → −120 or +150 → +160. Higher is a better price for the bettor.
 */
export function oddsCents(odds: number): number {
  return odds >= 100 ? odds - 100 : odds + 100;
}

export interface LineMove {
  /** Positive means the price got better for the bettor. */
  oddsCents: number;
  pointChanged: boolean;
  /** Enough to tell the player (and flag for the key holder). */
  significant: boolean;
}

export function lineMove(sealed: { odds: number; point: number | null }, now: { odds: number; point: number | null }): LineMove {
  const cents = oddsCents(now.odds) - oddsCents(sealed.odds);
  const pointChanged = sealed.point !== now.point;
  return { oddsCents: cents, pointChanged, significant: pointChanged || Math.abs(cents) >= LINE_MOVE_ALERT_CENTS };
}

/** The current line for a PickLine in a list of feed games, or null if DraftKings no longer offers it. */
export function findPickLine<G extends OddsGameBase>(games: G[], line: PickLine): { game: G; line: OddsLine } | null {
  const game = games.find((g) => g.eventId === line.eventId);
  const current = game?.lines[line.choice];
  return game && current ? { game, line: current } : null;
}

/**
 * The pick re-priced to the latest DraftKings line (`lineNow`) as the vault
 * opens, or null to leave it alone: typed in by hand, no price since it was
 * sealed, already re-priced, or the line didn't move.
 */
export function priceAtOpen(pick: {
  pickText: string;
  americanOdds: number;
  line?: PickLine;
  lineNow?: Pick<PickLineNow, 'odds' | 'point' | 'pickText'>;
  sealed?: PickSealed;
}): { pickText: string; americanOdds: number; line: PickLine; sealed: PickSealed } | null {
  const { line, lineNow } = pick;
  if (!line || !lineNow || pick.sealed) return null;
  if (lineNow.odds === pick.americanOdds && lineNow.point === line.point) return null;
  return {
    pickText: lineNow.pickText,
    americanOdds: lineNow.odds,
    line: { ...line, point: lineNow.point },
    sealed: { pickText: pick.pickText, americanOdds: pick.americanOdds, point: line.point },
  };
}

function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/** "Bears -3 (-115)" — the pick text for a line plus its price. */
export function lineLabel(game: Pick<OddsGameBase, 'homeTeam' | 'awayTeam'>, choice: OddsChoice, line: OddsLine): string {
  return `${oddsPickText(game, choice, line)} (${formatAmericanOdds(line.odds)})`;
}
