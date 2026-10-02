import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  ODDS_BOOKMAKER,
  ODDS_CREDITS_PER_PULL,
  ODDS_LOG_LENGTH,
  ODDS_MARKETS,
  ODDS_SPORT_KEY,
  oddsMonthKey,
  oddsPullBlockReason,
  parseOddsApiResponse,
  type OddsCallLogEntry,
  type OddsCallOutcome,
  type OddsFeed,
  type OddsSettings,
  type OddsUsageMonth,
} from '@vault/shared';
import { oddsFeedDoc, oddsSettingsDoc, oddsUsageDoc, weekDoc } from '../paths.js';

export interface PullOddsParams {
  apiKey: string | undefined;
  trigger: 'schedule' | 'manual';
  /** Injectable for tests; defaults to the real clock. */
  nowMs?: number;
  /** Injectable for tests; defaults to global fetch. Tests never hit the real API. */
  fetchImpl?: typeof fetch;
}

export interface PullOddsResult {
  outcome: OddsCallOutcome;
  games: number;
  credits: number;
  message: string | null;
}

function emptyUsage(monthKey: string): OddsUsageMonth {
  return {
    monthKey,
    calls: 0,
    creditsUsed: 0,
    errors: 0,
    skipped: 0,
    apiUsed: null,
    apiRemaining: null,
    lastCallAt: null,
    lastError: null,
    lastErrorAt: null,
    log: [],
  };
}

function headerInt(res: Response, name: string): number | null {
  const value = res.headers.get(name);
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** True when the active season's current week is still taking picks. */
async function hasOpenWeek(db: Firestore): Promise<boolean> {
  const seasons = await db.collection('seasons').where('status', '==', 'active').get();
  for (const season of seasons.docs) {
    const weekId = season.get('currentWeekId') as string | undefined;
    if (!weekId) continue;
    const week = await weekDoc(db, season.id, weekId).get();
    if (week.get('status') === 'open') return true;
  }
  return false;
}

/**
 * Pulls DraftKings NFL lines from The Odds API into `odds/feed` and records
 * the attempt in `oddsUsage/{YYYY-MM}`.
 *
 * Credits are reserved in a transaction before the request goes out, so two
 * pulls at once (schedule + "Pull now") can't both slip under the budget.
 * The reservation is then corrected to what the API says the call cost.
 */
export async function pullOddsLogic(db: Firestore, params: PullOddsParams): Promise<PullOddsResult> {
  const nowMs = params.nowMs ?? Date.now();
  const now = Timestamp.fromMillis(nowMs);
  const monthKey = oddsMonthKey(nowMs);
  const usageRef = oddsUsageDoc(db, monthKey);
  const fetchImpl = params.fetchImpl ?? fetch;

  async function record(entry: Omit<OddsCallLogEntry, 'at' | 'trigger'>, patch: (u: OddsUsageMonth) => void) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const usage = snap.exists ? (snap.data() as OddsUsageMonth) : emptyUsage(monthKey);
      patch(usage);
      usage.log = [{ at: now, trigger: params.trigger, ...entry }, ...(usage.log ?? [])].slice(0, ODDS_LOG_LENGTH);
      tx.set(usageRef, usage);
    });
    return { outcome: entry.outcome, games: entry.games, credits: entry.credits, message: entry.message };
  }

  const skip = (message: string) =>
    record({ outcome: 'skipped', credits: 0, games: 0, message }, (u) => {
      u.skipped += 1;
    });

  const fail = (message: string, credits: number, apiUsed: number | null, apiRemaining: number | null) =>
    record({ outcome: 'error', credits, games: 0, message }, (u) => {
      u.errors += 1;
      u.lastError = message;
      u.lastErrorAt = now;
      if (apiUsed !== null) u.apiUsed = apiUsed;
      if (apiRemaining !== null) u.apiRemaining = apiRemaining;
    });

  // Scheduled pulls only matter while players can still pick.
  if (params.trigger === 'schedule' && !(await hasOpenWeek(db))) {
    return skip('No week is open for picks.');
  }

  const apiKey = params.apiKey?.trim();
  if (!apiKey) {
    return fail('No ODDS_API_KEY secret is set.', 0, null, null);
  }

  // Reserve this pull's credits, or record why it can't run.
  const blockReason = await db.runTransaction(async (tx) => {
    const [usageSnap, settingsSnap] = await Promise.all([tx.get(usageRef), tx.get(oddsSettingsDoc(db))]);
    const usage = usageSnap.exists ? (usageSnap.data() as OddsUsageMonth) : emptyUsage(monthKey);
    const settings = settingsSnap.exists ? (settingsSnap.data() as OddsSettings) : { paused: false };
    const reason = oddsPullBlockReason({
      // "Pull now" is a deliberate Admin action, so the pause only stops the schedule.
      paused: params.trigger === 'schedule' && settings.paused,
      monthCreditsUsed: usage.creditsUsed,
      apiRemaining: usage.apiRemaining,
    });
    if (reason) return reason;
    usage.calls += 1;
    usage.creditsUsed += ODDS_CREDITS_PER_PULL;
    usage.lastCallAt = now;
    tx.set(usageRef, usage);
    return null;
  });
  if (blockReason) return skip(blockReason);

  const url = new URL(`https://api.the-odds-api.com/v4/sports/${ODDS_SPORT_KEY}/odds`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('bookmakers', ODDS_BOOKMAKER);
  url.searchParams.set('markets', ODDS_MARKETS.join(','));
  url.searchParams.set('oddsFormat', 'american');
  url.searchParams.set('dateFormat', 'iso');

  // Never let the key reach Firestore through an error message.
  const scrub = (message: string) => message.split(apiKey).join('***');

  /** Swaps the reserved credits for what the call actually cost. */
  const releaseReservation = (actual: number) =>
    db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      if (!snap.exists) return;
      const usage = snap.data() as OddsUsageMonth;
      tx.update(usageRef, { creditsUsed: Math.max(0, usage.creditsUsed - ODDS_CREDITS_PER_PULL + actual) });
    });

  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch (err) {
    // The request never reached the API, so nothing was charged.
    await releaseReservation(0);
    return fail(scrub(`Request failed: ${err instanceof Error ? err.message : String(err)}`), 0, null, null);
  }

  const apiUsed = headerInt(res, 'x-requests-used');
  const apiRemaining = headerInt(res, 'x-requests-remaining');
  const lastCost = headerInt(res, 'x-requests-last');

  if (!res.ok) {
    const body = scrub((await res.text().catch(() => '')).slice(0, 300));
    const cost = lastCost ?? 0;
    await releaseReservation(cost);
    return fail(`HTTP ${res.status}${body ? `: ${body}` : ''}`, cost, apiUsed, apiRemaining);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    const cost = lastCost ?? ODDS_CREDITS_PER_PULL;
    await releaseReservation(cost);
    return fail('The response was not valid JSON.', cost, apiUsed, apiRemaining);
  }

  const games = parseOddsApiResponse(raw);
  const feed: OddsFeed = {
    bookmaker: ODDS_BOOKMAKER,
    pulledAt: now,
    games: games.map(({ commenceMs, ...game }) => ({ ...game, commenceAt: Timestamp.fromMillis(commenceMs) })),
  };
  await oddsFeedDoc(db).set(feed);

  const cost = lastCost ?? ODDS_CREDITS_PER_PULL;
  await releaseReservation(cost);
  return record({ outcome: 'ok', credits: cost, games: games.length, message: null }, (u) => {
    if (apiUsed !== null) u.apiUsed = apiUsed;
    if (apiRemaining !== null) u.apiRemaining = apiRemaining;
  });
}

/** Admin switch for the scheduled pull. */
export async function setOddsPausedLogic(db: Firestore, params: { paused: unknown }): Promise<void> {
  if (typeof params.paused !== 'boolean') throw new HttpsError('invalid-argument', 'paused must be true or false.');
  const settings: OddsSettings = { paused: params.paused };
  await oddsSettingsDoc(db).set(settings);
}
