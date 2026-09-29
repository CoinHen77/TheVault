import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { DEFAULT_BUY_IN_CENTS, type BookDecision, type Season, type Week, type WeekType } from '@vault/shared';
import { seasonDoc, weekDoc } from '../paths.js';

const STARTING_BOOK_DECISION: BookDecision = {
  rule: 'all_losses_keep',
  candidates: [],
  tiebreakUsed: 'none',
};

export interface WeekDocInput {
  weekId: string;
  nflWeek: number | null;
  type: WeekType;
  order: number;
  buyInCents: number;
  lockAtMs: number;
  bookholderId: string;
  sharePriceAtOpen: number;
}

/**
 * Builds the plain object written for a new week doc. `closedAt` and the
 * lock/close snapshot fields are deliberately omitted until they're set at
 * lock/grading/close — the Week type describes the full lifecycle shape, not
 * every field's presence at every status.
 */
export function weekDocData(input: WeekDocInput): Omit<Week, 'closedAt'> {
  return {
    nflWeek: input.nflWeek,
    type: input.type,
    order: input.order,
    buyInCents: input.buyInCents,
    lockAt: Timestamp.fromMillis(input.lockAtMs),
    status: 'open',
    bookholderId: input.bookholderId,
    submittedPlayerIds: [],
    sharePriceAtOpen: input.sharePriceAtOpen,
    openingVaultCents: 0,
    bookCapCents: 0,
    bookNetCents: 0,
    closingVaultCents: 0,
    closingSharePrice: 0,
    totalSharesAtClose: 0,
    nextBookholderId: '',
    bookDecision: STARTING_BOOK_DECISION,
  };
}

/** Non-transactional create used by createSeason/createWeek (low concurrency risk, admin-only). */
export async function createWeekDoc(db: Firestore, seasonId: string, input: WeekDocInput): Promise<void> {
  const ref = weekDoc(db, seasonId, input.weekId);
  const existing = await ref.get();
  if (existing.exists) {
    throw new HttpsError('already-exists', `Week ${input.weekId} already exists.`);
  }
  await ref.set(weekDocData(input));
  await seasonDoc(db, seasonId).update({ currentWeekId: input.weekId });
}

export interface CreateSeasonParams {
  seasonId: string;
  name: string;
  adminUid: string;
  week4LockAtMs: number;
  /** Per-week-type overrides; any type left unset falls back to DEFAULT_BUY_IN_CENTS. */
  buyInDefaultsCents?: Partial<Record<WeekType, number>>;
  /** Minimum cumulative preload required before a player's weekly buy-in can be marked paid. 0/omitted = no gate. */
  requiredPreloadCents?: number;
}

/** SPEC.md §5 createSeason: season + first week (W04), Admin as Bookholder, share price 1.00. */
export async function createSeasonLogic(
  db: Firestore,
  params: CreateSeasonParams,
): Promise<{ seasonId: string; weekId: string }> {
  const { seasonId, name, adminUid, week4LockAtMs, buyInDefaultsCents, requiredPreloadCents = 0 } = params;

  const seasonRef = seasonDoc(db, seasonId);
  const existing = await seasonRef.get();
  if (existing.exists) {
    throw new HttpsError('already-exists', `Season ${seasonId} already exists.`);
  }

  const resolvedBuyInDefaults: Record<WeekType, number> = { ...DEFAULT_BUY_IN_CENTS, ...buyInDefaultsCents };

  const season: Season = {
    name,
    startWeek: 4,
    status: 'active',
    sharpPct: 0.1,
    bookCapPct: 0.25,
    currentWeekId: 'W04',
    totalShares: 0,
    vaultCents: 0,
    sharePrice: 1.0,
    buyInDefaultsCents: resolvedBuyInDefaults,
    requiredPreloadCents,
  };
  await seasonRef.set(season);

  await createWeekDoc(db, seasonId, {
    weekId: 'W04',
    nflWeek: 4,
    type: 'regular',
    order: 0,
    buyInCents: resolvedBuyInDefaults.regular,
    lockAtMs: week4LockAtMs,
    bookholderId: adminUid,
    sharePriceAtOpen: 1.0,
  });

  return { seasonId, weekId: 'W04' };
}

/** SPEC.md §5 (new) deleteSeason: Admin-only hard delete of a season and everything under it. Irreversible. */
export async function deleteSeasonLogic(db: Firestore, seasonId: string): Promise<void> {
  const seasonRef = seasonDoc(db, seasonId);
  const existing = await seasonRef.get();
  if (!existing.exists) {
    throw new HttpsError('not-found', `Season ${seasonId} not found.`);
  }
  await db.recursiveDelete(seasonRef);
}

export interface CreateWeekParams {
  seasonId: string;
  weekId: string;
  nflWeek: number | null;
  type: WeekType;
  order: number;
  buyInCents: number;
  lockAtMs: number;
  bookholderId: string;
}

/** SPEC.md §5 createWeek: sharePriceAtOpen is always the season's current closing share price. */
export async function createWeekLogic(db: Firestore, params: CreateWeekParams): Promise<{ weekId: string }> {
  const seasonSnap = await seasonDoc(db, params.seasonId).get();
  if (!seasonSnap.exists) {
    throw new HttpsError('not-found', `Season ${params.seasonId} not found.`);
  }
  const season = seasonSnap.data() as Season;

  await createWeekDoc(db, params.seasonId, {
    weekId: params.weekId,
    nflWeek: params.nflWeek,
    type: params.type,
    order: params.order,
    buyInCents: params.buyInCents,
    lockAtMs: params.lockAtMs,
    bookholderId: params.bookholderId,
    sharePriceAtOpen: season.sharePrice,
  });

  return { weekId: params.weekId };
}

export interface UpdateWeekParams {
  seasonId: string;
  weekId: string;
  nflWeek?: number | null;
  type?: WeekType;
  buyInCents?: number;
  lockAtMs?: number;
}

/**
 * Admin edit of a week's pre-lock fields (SPEC.md §7 screen 8 "create or edit
 * weeks"; §4 notes closeWeek's auto-created next week is "editable"). Only
 * while the week is still `open` — once locked, `openingVaultCents` and
 * `bookCapCents` are already snapshotted from `buyInCents`, so changing it
 * afterward would desync them.
 */
export async function updateWeekLogic(db: Firestore, params: UpdateWeekParams): Promise<void> {
  const { seasonId, weekId, nflWeek, type, buyInCents, lockAtMs } = params;
  const ref = weekDoc(db, seasonId, weekId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
  const week = snap.data() as Week;
  if (week.status !== 'open') {
    throw new HttpsError('failed-precondition', `Week ${weekId} is ${week.status}, not open.`);
  }

  const update: Record<string, unknown> = {};
  if (nflWeek !== undefined) update.nflWeek = nflWeek;
  if (type !== undefined) update.type = type;
  if (buyInCents !== undefined) update.buyInCents = buyInCents;
  if (lockAtMs !== undefined) update.lockAt = Timestamp.fromMillis(lockAtMs);
  if (Object.keys(update).length === 0) return;

  await ref.update(update);
}

/**
 * Default type/buy-in/lockAt for the week closeWeek auto-creates (SPEC.md §4,
 * §5 closeWeek step 8). Regular season increments nflWeek through 18, then
 * the playoff rounds progress in order; the Super Bowl has no next week.
 * `buyInDefaults` comes from the season doc (set at createSeason, editable
 * only there for now) — these are defaults only, Milestone 6's Admin screens
 * can edit any individual week's buy-in after it's created.
 */
export function computeNextWeekPlan(
  current: Pick<Week, 'type' | 'nflWeek' | 'lockAt' | 'order'>,
  buyInDefaults: Record<WeekType, number>,
): { weekId: string; nflWeek: number | null; type: WeekType; order: number; buyInCents: number; lockAtMs: number } | null {
  const lockAtMs = current.lockAt.toMillis() + 7 * 24 * 60 * 60 * 1000;
  const order = current.order + 1;

  if (current.type === 'regular') {
    const nflWeek = (current.nflWeek ?? 3) + 1;
    if (nflWeek <= 18) {
      return {
        weekId: `W${String(nflWeek).padStart(2, '0')}`,
        nflWeek,
        type: 'regular',
        order,
        buyInCents: buyInDefaults.regular,
        lockAtMs,
      };
    }
    return { weekId: 'WC', nflWeek: null, type: 'wildcard', order, buyInCents: buyInDefaults.wildcard, lockAtMs };
  }

  const progression: Partial<Record<WeekType, { weekId: string; type: WeekType }>> = {
    wildcard: { weekId: 'DIV', type: 'divisional' },
    divisional: { weekId: 'CONF', type: 'conference' },
    conference: { weekId: 'SB', type: 'superbowl' },
  };
  const next = progression[current.type];
  if (!next) return null;
  return { weekId: next.weekId, nflWeek: null, type: next.type, order, buyInCents: buyInDefaults[next.type], lockAtMs };
}
