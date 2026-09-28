import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { BookDecision, Season, Week, WeekType } from '@vault/shared';
import { seasonDoc, weekDoc } from '../paths.js';

/** SPEC.md §1.1 buy-in table. */
export const DEFAULT_BUY_IN_CENTS: Record<WeekType, number> = {
  regular: 1000,
  wildcard: 2500,
  divisional: 2500,
  conference: 5000,
  superbowl: 10000,
};

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
  week4BuyInCents?: number;
}

/** SPEC.md §5 createSeason: season + first week (W04), Admin as Bookholder, share price 1.00. */
export async function createSeasonLogic(
  db: Firestore,
  params: CreateSeasonParams,
): Promise<{ seasonId: string; weekId: string }> {
  const { seasonId, name, adminUid, week4LockAtMs, week4BuyInCents = DEFAULT_BUY_IN_CENTS.regular } = params;

  const seasonRef = seasonDoc(db, seasonId);
  const existing = await seasonRef.get();
  if (existing.exists) {
    throw new HttpsError('already-exists', `Season ${seasonId} already exists.`);
  }

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
  };
  await seasonRef.set(season);

  await createWeekDoc(db, seasonId, {
    weekId: 'W04',
    nflWeek: 4,
    type: 'regular',
    order: 0,
    buyInCents: week4BuyInCents,
    lockAtMs: week4LockAtMs,
    bookholderId: adminUid,
    sharePriceAtOpen: 1.0,
  });

  return { seasonId, weekId: 'W04' };
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
 * These are defaults only — Milestone 6's Admin screens can edit them.
 */
export function computeNextWeekPlan(
  current: Pick<Week, 'type' | 'nflWeek' | 'lockAt' | 'order'>,
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
        buyInCents: DEFAULT_BUY_IN_CENTS.regular,
        lockAtMs,
      };
    }
    return { weekId: 'WC', nflWeek: null, type: 'wildcard', order, buyInCents: DEFAULT_BUY_IN_CENTS.wildcard, lockAtMs };
  }

  const progression: Partial<Record<WeekType, { weekId: string; type: WeekType }>> = {
    wildcard: { weekId: 'DIV', type: 'divisional' },
    divisional: { weekId: 'CONF', type: 'conference' },
    conference: { weekId: 'SB', type: 'superbowl' },
  };
  const next = progression[current.type];
  if (!next) return null;
  return { weekId: next.weekId, nflWeek: null, type: next.type, order, buyInCents: DEFAULT_BUY_IN_CENTS[next.type], lockAtMs };
}
