import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  isPickLine,
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
  /** The odds-board line it was sealed from, if any (see lineMove.ts). */
  line?: unknown;
  /** Injectable for tests; defaults to the real clock. */
  nowMs?: number;
}

/** SPEC.md §5 submitPick: guards from §9.3 (unpaid, after lock, bad odds). */
export async function submitPickLogic(db: Firestore, params: SubmitPickParams): Promise<void> {
  const { seasonId, weekId, uid, pickText, gameText, americanOdds, line, nowMs = Date.now() } = params;
  assertValidOdds(americanOdds);
  if (line !== undefined && line !== null && !isPickLine(line)) {
    throw new HttpsError('invalid-argument', 'line is not a valid odds-board line.');
  }

  const weekRef = weekDoc(db, seasonId, weekId);
  const buyInRef = buyInDoc(db, seasonId, weekId, uid);
  const pickRef = pickDoc(db, seasonId, weekId, uid);

  const [weekSnap, buyInSnap, pickSnap] = await Promise.all([weekRef.get(), buyInRef.get(), pickRef.get()]);

  if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
  const week = weekSnap.data() as Week;
  if (week.status !== 'open') {
    throw new HttpsError('failed-precondition', `The vault for ${weekId} is already open, so picks are final.`);
  }
  if (nowMs >= week.lockAt.toMillis()) {
    throw new HttpsError('failed-precondition', `The vault for ${weekId} is already open, so picks are final.`);
  }

  const buyIn = buyInSnap.data() as BuyIn | undefined;
  if (!buyIn?.paid) {
    throw new HttpsError('failed-precondition', `${uid} has not paid their buy-in for ${weekId}.`);
  }

  const now = Timestamp.now();
  const existing = pickSnap.data() as PickDoc | undefined;
  // A reseal replaces the whole doc, so the old lineNow and alert go with it.
  const pick: PickDoc = {
    playerId: uid,
    pickText,
    gameText,
    americanOdds,
    submittedAt: existing?.submittedAt ?? now,
    updatedAt: now,
    result: 'pending',
    units: null,
    ...(isPickLine(line) ? { line } : {}),
  };
  const batch = db.batch();
  batch.set(pickRef, pick);
  batch.update(weekRef, { submittedPlayerIds: FieldValue.arrayUnion(uid) });
  await batch.commit();
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
  const batch = db.batch();
  batch.set(pickRef, pick);
  batch.update(weekRef, { submittedPlayerIds: FieldValue.arrayUnion(playerId) });
  await batch.commit();
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

export interface AdjustPickAtOpenParams {
  seasonId: unknown;
  weekId: unknown;
  playerId: unknown;
  pickText: unknown;
  americanOdds: unknown;
  adjustedBy: string;
}

/**
 * SPEC.md §1.3: the Admin sets a pick's vault-open line by hand, for picks
 * the odds feed can't price (typed in by hand, e.g. props). Only while the
 * vault is open and before grading. Units and the key decision then use these
 * odds; the original seal is kept in `sealed`, the first time only.
 */
export async function adjustPickAtOpenLogic(db: Firestore, params: AdjustPickAtOpenParams): Promise<void> {
  const { seasonId, weekId, playerId, americanOdds, adjustedBy } = params;
  if (typeof seasonId !== 'string' || !seasonId || typeof weekId !== 'string' || !weekId) {
    throw new HttpsError('invalid-argument', 'seasonId and weekId are required.');
  }
  if (typeof playerId !== 'string' || !playerId) throw new HttpsError('invalid-argument', 'playerId is required.');
  const pickText = typeof params.pickText === 'string' ? params.pickText.trim() : '';
  if (!pickText || pickText.length > 200) throw new HttpsError('invalid-argument', 'pickText is required.');
  if (typeof americanOdds !== 'number') throw new HttpsError('invalid-argument', 'americanOdds is required.');
  assertValidOdds(americanOdds);

  const weekRef = weekDoc(db, seasonId, weekId);
  const pickRef = pickDoc(db, seasonId, weekId, playerId);
  await db.runTransaction(async (tx) => {
    const [weekSnap, pickSnap] = await Promise.all([tx.get(weekRef), tx.get(pickRef)]);
    if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
    if ((weekSnap.data() as Week).status !== 'locked') {
      throw new HttpsError('failed-precondition', 'Prices can only be set while the vault is open, before grading.');
    }
    if (!pickSnap.exists) throw new HttpsError('not-found', `No pick from ${playerId} for ${weekId}.`);
    const pick = pickSnap.data() as PickDoc;
    if (pick.pickText === pickText && pick.americanOdds === americanOdds) return;

    tx.update(pickRef, {
      pickText,
      americanOdds,
      sealed: pick.sealed ?? { pickText: pick.pickText, americanOdds: pick.americanOdds, point: pick.line?.point ?? null },
      pricedAtOpenAt: Timestamp.now(),
      priceAdjustedBy: adjustedBy,
    });
  });
}
