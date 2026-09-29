import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  decideNextBookholder,
  sharePrice,
  withSeasonDefaults,
  type BookBet,
  type BookholderCandidate,
  type PickResult,
  type Pick as PickDoc,
  type Season,
  type Standing,
  type Week,
} from '@vault/shared';
import { bookBetsCol, ledgerCol, picksCol, seasonDoc, standingDoc, standingsCol, weekDoc, weeksCol } from '../paths.js';
import { computeNextWeekPlan, weekDocData } from './season.js';

export interface StartGradingParams {
  seasonId: string;
  weekId: string;
}

/** SPEC.md §4: locked → grading. */
export async function startGradingLogic(db: Firestore, params: StartGradingParams): Promise<void> {
  const { seasonId, weekId } = params;
  const weekRef = weekDoc(db, seasonId, weekId);
  const weekSnap = await weekRef.get();
  if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
  const week = weekSnap.data() as Week;
  if (week.status !== 'locked') {
    throw new HttpsError('failed-precondition', `Week ${weekId} is ${week.status}, not locked.`);
  }
  await weekRef.update({ status: 'grading' });
}

export interface CloseWeekParams {
  seasonId: string;
  weekId: string;
  adminUid: string;
  /** Injectable random source for the coin-flip tiebreak (SPEC.md §1.4). */
  random?: () => number;
}

export interface CloseWeekResult {
  nextBookholderId: string;
  bookNetCents: number;
  closingVaultCents: number;
  closingSharePrice: number;
  nextWeekId: string | null;
}

/** SPEC.md §5 closeWeek, run as a single transaction (CLAUDE.md money-update rule). */
export async function closeWeekLogic(db: Firestore, params: CloseWeekParams): Promise<CloseWeekResult> {
  const { seasonId, weekId, adminUid, random } = params;
  const weekRef = weekDoc(db, seasonId, weekId);
  const seasonRef = seasonDoc(db, seasonId);

  return db.runTransaction(async (tx) => {
    const [weekSnap, seasonSnap, picksSnap, betsSnap] = await Promise.all([
      tx.get(weekRef),
      tx.get(seasonRef),
      tx.get(picksCol(db, seasonId, weekId)),
      tx.get(bookBetsCol(db, seasonId, weekId)),
    ]);

    if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
    const week = weekSnap.data() as Week;
    if (week.status !== 'grading') {
      throw new HttpsError('failed-precondition', `Week ${weekId} is ${week.status}, not grading.`);
    }
    if (!seasonSnap.exists) throw new HttpsError('not-found', `Season ${seasonId} not found.`);
    const season = withSeasonDefaults(seasonSnap.data() as Season);

    const picks = picksSnap.docs.map((d) => ({ id: d.id, data: d.data() as PickDoc }));
    const bets = betsSnap.docs.map((d) => d.data() as BookBet);

    const pendingPick = picks.find((p) => p.data.result === 'pending');
    if (pendingPick) {
      throw new HttpsError('failed-precondition', `Pick from ${pendingPick.id} is still pending.`);
    }
    const pendingBet = bets.some((b) => b.result === 'pending');
    if (pendingBet) {
      throw new HttpsError('failed-precondition', `A book bet for ${weekId} is still pending.`);
    }

    // All reads (including these standings lookups) must precede every write below.
    const standingRefs = picks.map((p) => standingDoc(db, seasonId, p.id));
    const standingSnaps = await Promise.all(standingRefs.map((ref) => tx.get(ref)));

    const bookNetCents = bets.reduce((sum, b) => sum + (b.netCents ?? 0), 0);
    const closingVaultCents = week.openingVaultCents + bookNetCents;
    const totalSharesAtClose = season.totalShares;
    const closingSharePrice =
      totalSharesAtClose > 0 ? sharePrice(closingVaultCents, totalSharesAtClose) : season.sharePrice;

    const candidates: BookholderCandidate[] = picks.map((p, i) => {
      const standing = standingSnaps[i]?.data() as Standing | undefined;
      const priorUnits = standing?.units ?? 0;
      const weeksBoughtIn = standing?.weeksBoughtIn ?? 0;
      return {
        playerId: p.id,
        odds: p.data.americanOdds,
        result: p.data.result as Exclude<PickResult, 'pending'>,
        seasonUnits: priorUnits + (p.data.units ?? 0),
        weeksBoughtIn,
      };
    });

    const decision = decideNextBookholder({
      currentBookholderId: week.bookholderId,
      candidates,
      ...(random ? { random } : {}),
    });

    for (let i = 0; i < picks.length; i++) {
      const p = picks[i]!;
      const standingRef = standingRefs[i]!;
      const inc: Record<string, unknown> = { units: FieldValue.increment(p.data.units ?? 0) };
      if (p.data.result === 'win') inc.wins = FieldValue.increment(1);
      else if (p.data.result === 'loss') inc.losses = FieldValue.increment(1);
      else if (p.data.result === 'push') inc.pushes = FieldValue.increment(1);
      tx.update(standingRef, inc);
    }

    const closedAt = Timestamp.now();
    tx.update(weekRef, {
      bookNetCents,
      closingVaultCents,
      closingSharePrice,
      totalSharesAtClose,
      nextBookholderId: decision.nextBookholderId,
      bookDecision: {
        rule: decision.rule,
        candidates: decision.candidates,
        tiebreakUsed: decision.tiebreakUsed,
        ...(decision.coinFlipResult ? { coinFlipResult: decision.coinFlipResult } : {}),
      },
      status: 'closed',
      closedAt,
    });

    tx.set(ledgerCol(db, seasonId).doc(), {
      type: 'book_net',
      weekId,
      playerId: null,
      amountCents: bookNetCents,
      note: `Book net for ${weekId}`,
      createdAt: closedAt,
      createdBy: adminUid,
    });

    const seasonUpdate: Record<string, unknown> = {
      vaultCents: closingVaultCents,
      sharePrice: closingSharePrice,
    };

    let nextWeekId: string | null = null;
    if (week.type !== 'superbowl') {
      const plan = computeNextWeekPlan(week, season.buyInDefaultsCents);
      if (plan) {
        nextWeekId = plan.weekId;
        tx.set(
          weekDoc(db, seasonId, plan.weekId),
          weekDocData({
            weekId: plan.weekId,
            nflWeek: plan.nflWeek,
            type: plan.type,
            order: plan.order,
            buyInCents: plan.buyInCents,
            lockAtMs: plan.lockAtMs,
            bookholderId: decision.nextBookholderId,
            sharePriceAtOpen: closingSharePrice,
          }),
        );
        seasonUpdate.currentWeekId = plan.weekId;
      }
    }
    tx.update(seasonRef, seasonUpdate);

    return { nextBookholderId: decision.nextBookholderId, bookNetCents, closingVaultCents, closingSharePrice, nextWeekId };
  });
}

export interface OverrideBookholderParams {
  seasonId: string;
  weekId: string;
  target: 'current' | 'next';
  newBookholderId: string;
  adminUid: string;
}

/** SPEC.md §5 overrideBookholder: sets the current or next Bookholder; every override is logged via bookDecision. */
export async function overrideBookholderLogic(db: Firestore, params: OverrideBookholderParams): Promise<void> {
  const { seasonId, weekId, target, newBookholderId } = params;
  const weekRef = weekDoc(db, seasonId, weekId);
  const weekSnap = await weekRef.get();
  if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);

  const field = target === 'current' ? 'bookholderId' : 'nextBookholderId';
  await weekRef.update({
    [field]: newBookholderId,
    bookDecision: {
      rule: 'admin_override',
      candidates: [newBookholderId],
      tiebreakUsed: 'none',
    },
  });
}

export interface FinalizeSeasonParams {
  seasonId: string;
  adminUid: string;
  /** Required only when the units leader is tied (SPEC.md §10 open item). */
  sharpUidOverride?: string;
}

export interface FinalizeSeasonResult {
  sharpPlayerId: string;
  sharpAwardCents: number;
  groupVaultCents: number;
}

/** SPEC.md §5 finalizeSeason and §1.6. */
export async function finalizeSeasonLogic(db: Firestore, params: FinalizeSeasonParams): Promise<FinalizeSeasonResult> {
  const { seasonId, adminUid, sharpUidOverride } = params;

  const seasonRef = seasonDoc(db, seasonId);
  const seasonSnap = await seasonRef.get();
  if (!seasonSnap.exists) throw new HttpsError('not-found', `Season ${seasonId} not found.`);
  const season = withSeasonDefaults(seasonSnap.data() as Season);
  if (season.status !== 'active') {
    throw new HttpsError('failed-precondition', `Season ${seasonId} is already ${season.status}.`);
  }

  const sbSnap = await weeksCol(db, seasonId).where('type', '==', 'superbowl').limit(1).get();
  const sbWeek = sbSnap.docs[0]?.data() as Week | undefined;
  if (!sbWeek || sbWeek.status !== 'closed') {
    throw new HttpsError('failed-precondition', 'The Super Bowl week has not closed yet.');
  }

  const standingsSnap = await standingsCol(db, seasonId).get();
  const standings = standingsSnap.docs.map((d) => d.data() as Standing);
  if (standings.length === 0) {
    throw new HttpsError('failed-precondition', 'No standings to finalize.');
  }

  const maxUnits = Math.max(...standings.map((s) => s.units));
  const leaders = standings.filter((s) => s.units === maxUnits);

  let sharpPlayerId: string;
  if (leaders.length === 1) {
    sharpPlayerId = leaders[0]!.playerId;
  } else if (sharpUidOverride) {
    sharpPlayerId = sharpUidOverride;
  } else {
    throw new HttpsError(
      'failed-precondition',
      `Tie for Sharp at ${maxUnits.toFixed(2)}u among: ${leaders.map((l) => l.playerId).join(', ')}. Call again with sharpUidOverride.`,
    );
  }

  const sharpAwardCents = Math.round(season.vaultCents * season.sharpPct);
  const groupVaultCents = season.vaultCents - sharpAwardCents;
  const now = Timestamp.now();

  const batch = db.batch();
  batch.set(ledgerCol(db, seasonId).doc(), {
    type: 'sharp_award',
    weekId: null,
    playerId: sharpPlayerId,
    amountCents: sharpAwardCents,
    note: `The Sharp (${maxUnits.toFixed(2)}u)`,
    createdAt: now,
    createdBy: adminUid,
  });

  for (const standing of standings) {
    const portionCents =
      season.totalShares > 0 ? Math.round((standing.shares / season.totalShares) * groupVaultCents) : 0;
    batch.set(ledgerCol(db, seasonId).doc(), {
      type: 'final_distribution',
      weekId: null,
      playerId: standing.playerId,
      amountCents: portionCents,
      note: `Group Vault share (${standing.shares.toFixed(6)} of ${season.totalShares.toFixed(6)} shares)`,
      createdAt: now,
      createdBy: adminUid,
    });
  }

  batch.update(seasonRef, { status: 'finalized' });
  await batch.commit();

  return { sharpPlayerId, sharpAwardCents, groupVaultCents };
}
