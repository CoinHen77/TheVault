/**
 * Cloud Functions for The Vault (2nd gen, Node 20). Implements SPEC.md §5.
 *
 * Every onCall wrapper here is a thin adapter: it extracts uid/admin-claim
 * from the request and delegates to a pure(ish) `*Logic` function in
 * `./logic`, which takes an injected `Firestore` and plain params. That split
 * is what lets Milestone 3's emulator tests call the business logic directly
 * without going through the callable HTTPS transport.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { SHARED_VERSION } from '@vault/shared';

import { rejectUninvitedUsers } from './auth.js';
import { isAdminRequest, requireAdmin, requireUid } from './context.js';
import { markBuyInPaidLogic, unmarkBuyInLogic } from './logic/buyIns.js';
import {
  deleteBookBetLogic,
  gradeBookBetLogic,
  placeBookBetLogic,
  updateBookBetLogic,
} from './logic/bookBets.js';
import { lockDueWeeksLogic } from './logic/lock.js';
import { adminSubmitPickLogic, gradePickLogic, submitPickLogic } from './logic/picks.js';
import { markPreloadPaidLogic, unmarkPreloadLogic } from './logic/preload.js';
import { createSeasonLogic, createWeekLogic, deleteSeasonLogic, updateWeekLogic } from './logic/season.js';
import {
  closeWeekLogic,
  finalizeSeasonLogic,
  overrideBookholderLogic,
  startGradingLogic,
} from './logic/weekLifecycle.js';

initializeApp();

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

function db() {
  return getFirestore();
}

/** Health check: confirms the callable transport and the /shared import chain. */
export const ping = onCall((request) => {
  return {
    ok: true,
    sharedVersion: SHARED_VERSION,
    uid: request.auth?.uid ?? null,
    serverTime: new Date().toISOString(),
  };
});

export const createSeason = onCall((request) => {
  const adminUid = requireAdmin(request);
  return createSeasonLogic(db(), { ...request.data, adminUid });
});

export const createWeek = onCall((request) => {
  requireAdmin(request);
  return createWeekLogic(db(), request.data);
});

export const updateWeek = onCall((request) => {
  requireAdmin(request);
  return updateWeekLogic(db(), request.data);
});

export const markBuyInPaid = onCall((request) => {
  const markedBy = requireAdmin(request);
  return markBuyInPaidLogic(db(), { ...request.data, markedBy });
});

export const unmarkBuyIn = onCall((request) => {
  const unmarkedBy = requireAdmin(request);
  return unmarkBuyInLogic(db(), { ...request.data, unmarkedBy });
});

export const markPreloadPaid = onCall((request) => {
  const markedBy = requireAdmin(request);
  return markPreloadPaidLogic(db(), { ...request.data, markedBy });
});

export const unmarkPreload = onCall((request) => {
  const unmarkedBy = requireAdmin(request);
  return unmarkPreloadLogic(db(), { ...request.data, unmarkedBy });
});

/** Admin-only hard delete of a season and everything under it. Irreversible — the client gates this behind a type-to-confirm prompt. */
export const deleteSeason = onCall((request) => {
  requireAdmin(request);
  return deleteSeasonLogic(db(), request.data.seasonId);
});

export const submitPick = onCall((request) => {
  const uid = requireUid(request);
  return submitPickLogic(db(), { ...request.data, uid });
});

export const adminSubmitPick = onCall((request) => {
  const enteredBy = requireAdmin(request);
  return adminSubmitPickLogic(db(), { ...request.data, enteredBy });
});

export const startGrading = onCall((request) => {
  requireAdmin(request);
  return startGradingLogic(db(), request.data);
});

export const gradePick = onCall((request) => {
  requireAdmin(request);
  return gradePickLogic(db(), request.data);
});

export const gradeBookBet = onCall((request) => {
  requireAdmin(request);
  return gradeBookBetLogic(db(), request.data);
});

export const closeWeek = onCall((request) => {
  const adminUid = requireAdmin(request);
  return closeWeekLogic(db(), { ...request.data, adminUid });
});

export const overrideBookholder = onCall((request) => {
  const adminUid = requireAdmin(request);
  return overrideBookholderLogic(db(), { ...request.data, adminUid });
});

export const finalizeSeason = onCall((request) => {
  const adminUid = requireAdmin(request);
  return finalizeSeasonLogic(db(), { ...request.data, adminUid });
});

export const placeBookBet = onCall((request) => {
  const uid = requireUid(request);
  return placeBookBetLogic(db(), { ...request.data, uid, isAdmin: isAdminRequest(request) });
});

export const updateBookBet = onCall((request) => {
  const uid = requireUid(request);
  return updateBookBetLogic(db(), { ...request.data, uid, isAdmin: isAdminRequest(request) });
});

export const deleteBookBet = onCall((request) => {
  const uid = requireUid(request);
  return deleteBookBetLogic(db(), { ...request.data, uid, isAdmin: isAdminRequest(request) });
});

/** SPEC.md §5 lockDueWeeks: every 5 minutes. */
export const lockDueWeeks = onSchedule('every 5 minutes', async () => {
  await lockDueWeeksLogic(db());
});

/** SPEC.md §6 membership gate. */
export { rejectUninvitedUsers };
