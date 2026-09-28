import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  isValidAmericanOdds,
  unitsForPick,
  type BuyIn,
  type Pick as PickDoc,
  type Week,
} from '@vault/shared';
import { buyInDoc, pickDoc, weekDoc } from '../paths.js';

function assertValidOdds(odds: number): void {
  if (!isValidAmericanOdds(odds)) {
    throw new HttpsError('invalid-argument', `Invalid American odds: ${odds}. Must be an integer ≤ -100 or ≥ 100.`);
  }
}

export interface SubmitPickParams {
  seasonId: string;
  weekId: string;
  uid: string;
  pickText: string;
  gameText: string;
  americanOdds: number;
  /** Injectable for tests; defaults to the real clock. */
  nowMs?: number;
}

/** SPEC.md §5 submitPick: guards from §9.3 (unpaid, after lock, bad odds). */
export async function submitPickLogic(db: Firestore, params: SubmitPickParams): Promise<void> {
  const { seasonId, weekId, uid, pickText, gameText, americanOdds, nowMs = Date.now() } = params;
  assertValidOdds(americanOdds);

  const weekRef = weekDoc(db, seasonId, weekId);
  const buyInRef = buyInDoc(db, seasonId, weekId, uid);
  const pickRef = pickDoc(db, seasonId, weekId, uid);

  const [weekSnap, buyInSnap, pickSnap] = await Promise.all([weekRef.get(), buyInRef.get(), pickRef.get()]);

  if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
  const week = weekSnap.data() as Week;
  if (week.status !== 'open') {
    throw new HttpsError('failed-precondition', `Week ${weekId} is ${week.status}, not open.`);
  }
  if (nowMs >= week.lockAt.toMillis()) {
    throw new HttpsError('failed-precondition', `Picks for ${weekId} are locked.`);
  }

  const buyIn = buyInSnap.data() as BuyIn | undefined;
  if (!buyIn?.paid) {
    throw new HttpsError('failed-precondition', `${uid} has not paid their buy-in for ${weekId}.`);
  }

  const now = Timestamp.now();
  const existing = pickSnap.data() as PickDoc | undefined;
  const pick: PickDoc = {
    playerId: uid,
    pickText,
    gameText,
    americanOdds,
    submittedAt: existing?.submittedAt ?? now,
    updatedAt: now,
    result: 'pending',
    units: null,
  };
  await pickRef.set(pick);
}

export interface AdminSubmitPickParams {
  seasonId: string;
  weekId: string;
  playerId: string;
  pickText: string;
  gameText: string;
  americanOdds: number;
  enteredBy: string;
}

/** SPEC.md §5 adminSubmitPick: allowed in any status except closed; records enteredBy. */
export async function adminSubmitPickLogic(db: Firestore, params: AdminSubmitPickParams): Promise<void> {
  const { seasonId, weekId, playerId, pickText, gameText, americanOdds, enteredBy } = params;
  assertValidOdds(americanOdds);

  const weekRef = weekDoc(db, seasonId, weekId);
  const buyInRef = buyInDoc(db, seasonId, weekId, playerId);
  const pickRef = pickDoc(db, seasonId, weekId, playerId);

  const [weekSnap, buyInSnap, pickSnap] = await Promise.all([weekRef.get(), buyInRef.get(), pickRef.get()]);

  if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
  const week = weekSnap.data() as Week;
  if (week.status === 'closed') {
    throw new HttpsError('failed-precondition', `Week ${weekId} is closed.`);
  }

  const buyIn = buyInSnap.data() as BuyIn | undefined;
  if (!buyIn?.paid) {
    throw new HttpsError('failed-precondition', `${playerId} has not paid their buy-in for ${weekId}.`);
  }

  const now = Timestamp.now();
  const existing = pickSnap.data() as PickDoc | undefined;
  const pick: PickDoc = {
    playerId,
    pickText,
    gameText,
    americanOdds,
    submittedAt: existing?.submittedAt ?? now,
    updatedAt: now,
    result: 'pending',
    units: null,
    enteredBy,
  };
  await pickRef.set(pick);
}

export interface GradePickParams {
  seasonId: string;
  weekId: string;
  playerId: string;
  result: 'win' | 'loss' | 'push';
}

/** SPEC.md §5 gradePick: sets the result and computes units. */
export async function gradePickLogic(db: Firestore, params: GradePickParams): Promise<{ units: number }> {
  const { seasonId, weekId, playerId, result } = params;

  const weekRef = weekDoc(db, seasonId, weekId);
  const pickRef = pickDoc(db, seasonId, weekId, playerId);
  const [weekSnap, pickSnap] = await Promise.all([weekRef.get(), pickRef.get()]);

  if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
  const week = weekSnap.data() as Week;
  if (week.status !== 'grading') {
    throw new HttpsError('failed-precondition', `Week ${weekId} is ${week.status}, not grading.`);
  }
  if (!pickSnap.exists) throw new HttpsError('not-found', `No pick from ${playerId} for ${weekId}.`);
  const pick = pickSnap.data() as PickDoc;

  const units = unitsForPick(pick.americanOdds, result);
  await pickRef.update({ result, units });
  return { units };
}
