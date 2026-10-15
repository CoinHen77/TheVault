/**
 * The weekly update PDF (Control room, added on request; not in SPEC.md).
 * Everything here is derived from existing docs for one closed week: the
 * Vault's move, every pick, the Book, who got the key, and the season
 * standings as they stood when that week closed (rebuilt from the closed
 * weeks up to it, so an older week's update still reads right).
 *
 * Pure: no Firebase, no formatting of dates. The PDF itself lives in /web.
 */
import { americanToDecimal } from './odds.js';
import type { BookBet, BookDecision, BuyIn, Pick, PickResult, Preload, Week } from './types.js';

type WithId<T> = T & { id: string };

export interface WeeklyReportInput {
  /** The closed week the update is about. */
  week: WithId<Week>;
  picks: WithId<Pick>[];
  bets: WithId<BookBet>[];
  /** Every closed week with order ≤ week.order (including `week`), with its picks and buy-ins. */
  history: { week: WithId<Week>; picks: WithId<Pick>[]; buyIns: WithId<BuyIn>[] }[];
  preloads: WithId<Preload>[];
  /** uid → display name. */
  names: Record<string, string>;
  /** Week created at close, if there is one. */
  nextWeek: WithId<Week> | null;
}

export interface ReportPickRow {
  playerId: string;
  name: string;
  pickText: string;
  gameText: string;
  americanOdds: number;
  /** "Bears -2.5 -110" when the pick was re-priced at vault open. */
  sealedText: string | null;
  result: PickResult;
  units: number;
  getsKey: boolean;
  inBook: boolean;
}

export interface ReportBetRow {
  id: string;
  legs: { name: string; pickText: string; result: PickResult }[];
  stakeCents: number;
  ticketOdds: number;
  payoutCents: number | null;
  result: PickResult;
  netCents: number;
}

export interface ReportStandingRow {
  rank: number;
  /** Rank after the previous closed week; null if they weren't ranked yet. */
  prevRank: number | null;
  playerId: string;
  name: string;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  weeksBoughtIn: number;
  shares: number;
  valueCents: number;
}

export interface ReportAward {
  key: 'bigHit' | 'climber' | 'hotHand' | 'downSwinging' | 'bookMvp';
  title: string;
  name: string;
  detail: string;
}

export interface WeeklyReport {
  weekId: string;
  vault: {
    openingCents: number;
    bookNetCents: number;
    closingCents: number;
    sharePriceBefore: number;
    sharePriceAfter: number;
    /** Share price change in percent, e.g. 4.2. */
    sharePricePct: number;
  };
  headline: string;
  subhead: string;
  record: { w: number; l: number; p: number };
  picks: ReportPickRow[];
  bets: ReportBetRow[];
  bookholder: { id: string; name: string };
  stakedCents: number;
  key: { id: string; name: string; decision: BookDecision | null };
  awards: ReportAward[];
  standings: ReportStandingRow[];
  next: { week: WithId<Week>; keyHolderName: string } | null;
}

function money(cents: number): string {
  const sign = cents < 0 ? '−' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signedMoney(cents: number): string {
  return cents > 0 ? `+${money(cents)}` : money(cents);
}

function odds(o: number): string {
  return o > 0 ? `+${o}` : `${o}`;
}

function units(u: number): string {
  const sign = u > 0 ? '+' : u < 0 ? '−' : '';
  return `${sign}${Math.abs(u).toFixed(2)}u`;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Season standings as of the closed weeks given (sorted like the Sharp screen: units, then weeks). */
export function standingsAsOf(
  history: WeeklyReportInput['history'],
  preloads: WeeklyReportInput['preloads'],
  names: Record<string, string>,
  sharePrice: number,
  closedAtMs: number,
): Omit<ReportStandingRow, 'prevRank'>[] {
  const rows = new Map<string, Omit<ReportStandingRow, 'rank' | 'prevRank'>>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { playerId: id, name: names[id] ?? id, wins: 0, losses: 0, pushes: 0, units: 0, weeksBoughtIn: 0, shares: 0, valueCents: 0 };
      rows.set(id, r);
    }
    return r;
  };

  for (const { picks, buyIns } of history) {
    for (const p of picks) {
      const r = row(p.id);
      if (p.result === 'win') r.wins += 1;
      else if (p.result === 'loss') r.losses += 1;
      else if (p.result === 'push') r.pushes += 1;
      r.units = round6(r.units + (p.units ?? 0));
    }
    for (const b of buyIns) {
      if (!b.paid) continue;
      const r = row(b.id);
      r.weeksBoughtIn += 1;
      r.shares = round6(r.shares + b.sharesIssued);
    }
  }
  for (const p of preloads) {
    if (!p.paid || p.paidAt.toMillis() > closedAtMs) continue;
    const r = row(p.id);
    r.shares = round6(r.shares + p.sharesIssued);
  }

  return [...rows.values()]
    .map((r) => ({ ...r, valueCents: Math.round(r.shares * sharePrice * 100) }))
    .sort((a, b) => b.units - a.units || b.weeksBoughtIn - a.weeksBoughtIn || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Consecutive wins on a player's most recent picks, oldest week first in `history`. */
function winStreak(history: WeeklyReportInput['history'], playerId: string): number {
  let streak = 0;
  for (const { picks } of history) {
    const pick = picks.find((p) => p.id === playerId);
    if (!pick) continue;
    streak = pick.result === 'win' ? streak + 1 : 0;
  }
  return streak;
}

export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const { week, names } = input;
  const name = (id: string) => names[id] ?? id;
  const history = [...input.history].sort((a, b) => a.week.order - b.week.order);
  const closedAtMs = week.closedAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;

  const legIds = new Set(input.bets.flatMap((b) => b.legPickIds));
  const nextKeyId = week.nextBookholderId;

  const picks: ReportPickRow[] = input.picks
    .map((p) => ({
      playerId: p.id,
      name: name(p.id),
      pickText: p.pickText,
      gameText: p.gameText,
      americanOdds: p.americanOdds,
      sealedText: p.sealed ? `${p.sealed.pickText} ${odds(p.sealed.americanOdds)}` : null,
      result: p.result,
      units: p.units ?? 0,
      getsKey: p.id === nextKeyId,
      inBook: legIds.has(p.id),
    }))
    .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));

  const record = { w: 0, l: 0, p: 0 };
  for (const p of picks) {
    if (p.result === 'win') record.w += 1;
    else if (p.result === 'loss') record.l += 1;
    else if (p.result === 'push') record.p += 1;
  }

  const pickById = new Map(input.picks.map((p) => [p.id, p]));
  const bets: ReportBetRow[] = [...input.bets]
    .sort((a, b) => a.placedAt.toMillis() - b.placedAt.toMillis())
    .map((b) => ({
      id: b.id,
      legs: b.legPickIds.map((id) => ({
        name: name(id),
        pickText: pickById.get(id)?.pickText ?? '?',
        result: pickById.get(id)?.result ?? 'pending',
      })),
      stakeCents: b.stakeCents,
      ticketOdds: b.ticketOdds,
      payoutCents: b.payoutCents,
      result: b.result,
      netCents: b.netCents ?? 0,
    }));
  const stakedCents = bets.reduce((s, b) => s + b.stakeCents, 0);

  const before = history.filter((h) => h.week.order < week.order);
  const prev = before.length > 0 ? before[before.length - 1]!.week : null;
  const current = standingsAsOf(history, input.preloads, names, week.closingSharePrice, closedAtMs);
  const previous = prev
    ? standingsAsOf(before, input.preloads, names, prev.closingSharePrice, prev.closedAt?.toMillis() ?? 0)
    : [];
  const prevRanks = new Map(previous.map((r) => [r.playerId, r.rank]));
  const standings: ReportStandingRow[] = current.map((r) => ({ ...r, prevRank: prevRanks.get(r.playerId) ?? null }));

  const sharePriceBefore = week.sharePriceAtOpen;
  const sharePriceAfter = week.closingSharePrice;
  const sharePricePct = sharePriceBefore > 0 ? Math.round(((sharePriceAfter / sharePriceBefore - 1) * 100) * 10) / 10 : 0;

  // Fun bits: only the ones that actually happened this week.
  const awards: ReportAward[] = [];
  const wins = picks.filter((p) => p.result === 'win');
  const bigHit = wins[0];
  if (bigHit) {
    awards.push({
      key: 'bigHit',
      title: 'Big hit',
      name: bigHit.name,
      detail: `${bigHit.pickText} at ${odds(bigHit.americanOdds)} for ${units(bigHit.units)}`,
    });
  }
  const climber = standings
    .filter((r) => r.prevRank !== null && r.prevRank > r.rank)
    .sort((a, b) => b.prevRank! - b.rank - (a.prevRank! - a.rank))[0];
  if (climber) {
    const spots = climber.prevRank! - climber.rank;
    awards.push({
      key: 'climber',
      title: 'Climber',
      name: climber.name,
      detail: `Up ${spots} spot${spots === 1 ? '' : 's'} to #${climber.rank} in the Sharp race`,
    });
  }
  const streaks = picks
    .filter((p) => p.result === 'win')
    .map((p) => ({ p, streak: winStreak(history, p.playerId) }))
    .filter((s) => s.streak >= 2)
    .sort((a, b) => b.streak - a.streak);
  if (streaks[0]) {
    awards.push({
      key: 'hotHand',
      title: 'Hot hand',
      name: streaks[0].p.name,
      detail: `${streaks[0].streak} wins in a row`,
    });
  }
  const bestBet = [...bets].filter((b) => b.netCents > 0).sort((a, b) => b.netCents - a.netCents)[0];
  if (bestBet) {
    awards.push({
      key: 'bookMvp',
      title: 'Book MVP',
      name: name(week.bookholderId),
      detail: `${bestBet.legs.length === 1 ? 'Straight bet' : `${bestBet.legs.length}-leg parlay`} at ${odds(bestBet.ticketOdds)} cashed ${signedMoney(bestBet.netCents)}`,
    });
  }
  const swing = picks
    .filter((p) => p.result === 'loss')
    .sort((a, b) => americanToDecimal(b.americanOdds) - americanToDecimal(a.americanOdds))[0];
  if (swing && awards.length < 4) {
    awards.push({
      key: 'downSwinging',
      title: 'Went down swinging',
      name: swing.name,
      detail: `${swing.pickText} at ${odds(swing.americanOdds)}`,
    });
  }

  const net = week.bookNetCents;
  const headline =
    bets.length === 0
      ? 'The Book sat this one out'
      : net > 0
        ? `The Book cashed ${money(net)}`
        : net < 0
          ? `The Book took a ${money(-net)} hit`
          : 'The Book broke even';
  const subhead = `The Vault ${week.closingVaultCents >= week.openingVaultCents ? 'climbs' : 'slips'} to ${money(
    week.closingVaultCents,
  )}. The crew went ${record.w}-${record.l}-${record.p}.`;

  return {
    weekId: week.id,
    vault: {
      openingCents: week.openingVaultCents,
      bookNetCents: net,
      closingCents: week.closingVaultCents,
      sharePriceBefore,
      sharePriceAfter,
      sharePricePct,
    },
    headline,
    subhead,
    record,
    picks,
    bets,
    bookholder: { id: week.bookholderId, name: name(week.bookholderId) },
    stakedCents,
    key: { id: nextKeyId, name: name(nextKeyId), decision: week.bookDecision ?? null },
    awards: awards.slice(0, 4),
    standings,
    next: input.nextWeek ? { week: input.nextWeek, keyHolderName: name(input.nextWeek.bookholderId) } : null,
  };
}
