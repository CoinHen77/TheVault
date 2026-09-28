import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  bookBetNetCents,
  defaultBookPayoutCents,
  isValidAmericanOdds,
  type BookBet,
  type Week,
} from '@vault/shared';
import { bookBetDoc, bookBetsCol, pickDoc, weekDoc } from '../paths.js';

function assertBookholderOrAdmin(week: Week, uid: string, isAdmin: boolean): void {
  if (!isAdmin && week.bookholderId !== uid) {
    throw new HttpsError('permission-denied', 'Only the Bookholder or an Admin can manage book bets.');
  }
}

async function sumOtherStakes(db: Firestore, seasonId: string, weekId: string, excludeBetId?: string): Promise<number> {
  const snap = await bookBetsCol(db, seasonId, weekId).get();
  let sum = 0;
  for (const doc of snap.docs) {
    if (doc.id === excludeBetId) continue;
    sum += (doc.data() as BookBet).stakeCents;
  }
  return sum;
}

export interface PlaceBookBetParams {
  seasonId: string;
  weekId: string;
  uid: string;
  isAdmin: boolean;
  legPickIds: string[];
  stakeCents: number;
  ticketOdds: number;
  payoutCentsOverride?: number;
}

/** SPEC.md §5 placeBookBet: locked week, legs from this week, cap enforced. */
export async function placeBookBetLogic(db: Firestore, params: PlaceBookBetParams): Promise<{ betId: string }> {
  const { seasonId, weekId, uid, isAdmin, legPickIds, stakeCents, ticketOdds, payoutCentsOverride } = params;

  if (!Number.isInteger(stakeCents) || stakeCents <= 0) {
    throw new HttpsError('invalid-argument', 'stakeCents must be a positive integer.');
  }
  if (legPickIds.length === 0) {
    throw new HttpsError('invalid-argument', 'A book bet needs at least one leg.');
  }
  if (!isValidAmericanOdds(ticketOdds)) {
    throw new HttpsError('invalid-argument', `Invalid ticket odds: ${ticketOdds}.`);
  }

  const weekRef = weekDoc(db, seasonId, weekId);
  const weekSnap = await weekRef.get();
  if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
  const week = weekSnap.data() as Week;
  if (week.status !== 'locked') {
    throw new HttpsError('failed-precondition', `Week ${weekId} is ${week.status}, not locked.`);
  }
  assertBookholderOrAdmin(week, uid, isAdmin);

  const legSnaps = await Promise.all(legPickIds.map((legId) => pickDoc(db, seasonId, weekId, legId).get()));
  const missingLeg = legSnaps.find((snap) => !snap.exists);
  if (missingLeg) {
    throw new HttpsError('invalid-argument', `Leg ${missingLeg.id} is not a pick submitted for ${weekId}.`);
  }

  const otherStakes = await sumOtherStakes(db, seasonId, weekId);
  if (otherStakes + stakeCents > week.bookCapCents) {
    throw new HttpsError(
      'failed-precondition',
      `Stake would bring total to ${otherStakes + stakeCents}¢, over the ${week.bookCapCents}¢ cap.`,
    );
  }

  const payoutCents = payoutCentsOverride ?? defaultBookPayoutCents(stakeCents, ticketOdds);
  const betRef = bookBetsCol(db, seasonId, weekId).doc();
  const bet: BookBet = {
    legPickIds,
    stakeCents,
    ticketOdds,
    payoutCents,
    result: 'pending',
    netCents: null,
    placedBy: uid,
    placedAt: Timestamp.now(),
  };
  await betRef.set(bet);
  return { betId: betRef.id };
}

export interface UpdateBookBetParams {
  seasonId: string;
  weekId: string;
  betId: string;
  uid: string;
  isAdmin: boolean;
  legPickIds?: string[];
  stakeCents?: number;
  ticketOdds?: number;
  payoutCentsOverride?: number;
}

/** SPEC.md §5 updateBookBet: allowed only while the week is locked. */
export async function updateBookBetLogic(db: Firestore, params: UpdateBookBetParams): Promise<void> {
  const { seasonId, weekId, betId, uid, isAdmin, legPickIds, stakeCents, ticketOdds, payoutCentsOverride } = params;

  const weekRef = weekDoc(db, seasonId, weekId);
  const betRef = bookBetDoc(db, seasonId, weekId, betId);
  const [weekSnap, betSnap] = await Promise.all([weekRef.get(), betRef.get()]);

  if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
  const week = weekSnap.data() as Week;
  if (week.status !== 'locked') {
    throw new HttpsError('failed-precondition', `Week ${weekId} is ${week.status}, not locked.`);
  }
  assertBookholderOrAdmin(week, uid, isAdmin);
  if (!betSnap.exists) throw new HttpsError('not-found', `Book bet ${betId} not found.`);
  const bet = betSnap.data() as BookBet;

  if (legPickIds) {
    const legSnaps = await Promise.all(legPickIds.map((legId) => pickDoc(db, seasonId, weekId, legId).get()));
    const missingLeg = legSnaps.find((snap) => !snap.exists);
    if (missingLeg) {
      throw new HttpsError('invalid-argument', `Leg ${missingLeg.id} is not a pick submitted for ${weekId}.`);
    }
  }

  const nextStakeCents = stakeCents ?? bet.stakeCents;
  if (!Number.isInteger(nextStakeCents) || nextStakeCents <= 0) {
    throw new HttpsError('invalid-argument', 'stakeCents must be a positive integer.');
  }
  const nextTicketOdds = ticketOdds ?? bet.ticketOdds;
  if (!isValidAmericanOdds(nextTicketOdds)) {
    throw new HttpsError('invalid-argument', `Invalid ticket odds: ${nextTicketOdds}.`);
  }

  const otherStakes = await sumOtherStakes(db, seasonId, weekId, betId);
  if (otherStakes + nextStakeCents > week.bookCapCents) {
    throw new HttpsError(
      'failed-precondition',
      `Stake would bring total to ${otherStakes + nextStakeCents}¢, over the ${week.bookCapCents}¢ cap.`,
    );
  }

  await betRef.update({
    legPickIds: legPickIds ?? bet.legPickIds,
    stakeCents: nextStakeCents,
    ticketOdds: nextTicketOdds,
    payoutCents: payoutCentsOverride ?? defaultBookPayoutCents(nextStakeCents, nextTicketOdds),
  });
}

export interface DeleteBookBetParams {
  seasonId: string;
  weekId: string;
  betId: string;
  uid: string;
  isAdmin: boolean;
}

/** SPEC.md §5 deleteBookBet: allowed only while the week is locked. */
export async function deleteBookBetLogic(db: Firestore, params: DeleteBookBetParams): Promise<void> {
  const { seasonId, weekId, betId, uid, isAdmin } = params;

  const weekRef = weekDoc(db, seasonId, weekId);
  const betRef = bookBetDoc(db, seasonId, weekId, betId);
  const [weekSnap, betSnap] = await Promise.all([weekRef.get(), betRef.get()]);

  if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
  const week = weekSnap.data() as Week;
  if (week.status !== 'locked') {
    throw new HttpsError('failed-precondition', `Week ${weekId} is ${week.status}, not locked.`);
  }
  assertBookholderOrAdmin(week, uid, isAdmin);
  if (!betSnap.exists) throw new HttpsError('not-found', `Book bet ${betId} not found.`);

  await betRef.delete();
}

export interface GradeBookBetParams {
  seasonId: string;
  weekId: string;
  betId: string;
  result: 'win' | 'loss' | 'push';
  payoutCentsOverride?: number;
}

/** SPEC.md §5 gradeBookBet: sets the result, optionally overrides payout, computes netCents. */
export async function gradeBookBetLogic(db: Firestore, params: GradeBookBetParams): Promise<{ netCents: number }> {
  const { seasonId, weekId, betId, result, payoutCentsOverride } = params;

  const weekRef = weekDoc(db, seasonId, weekId);
  const betRef = bookBetDoc(db, seasonId, weekId, betId);
  const [weekSnap, betSnap] = await Promise.all([weekRef.get(), betRef.get()]);

  if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
  const week = weekSnap.data() as Week;
  if (week.status !== 'grading') {
    throw new HttpsError('failed-precondition', `Week ${weekId} is ${week.status}, not grading.`);
  }
  if (!betSnap.exists) throw new HttpsError('not-found', `Book bet ${betId} not found.`);
  const bet = betSnap.data() as BookBet;

  const netCents = bookBetNetCents({
    stakeCents: bet.stakeCents,
    ticketOdds: bet.ticketOdds,
    result,
    ...(payoutCentsOverride !== undefined ? { payoutCentsOverride } : {}),
  });
  const payoutCents =
    result === 'win' ? (payoutCentsOverride ?? defaultBookPayoutCents(bet.stakeCents, bet.ticketOdds)) : null;

  await betRef.update({ result, netCents, payoutCents });
  return { netCents };
}
