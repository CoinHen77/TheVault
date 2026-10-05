/**
 * Firestore document/collection references for SPEC.md §3, parameterized by
 * an injected `Firestore` instance so logic modules stay testable against
 * either the production app or an emulator-backed instance in tests.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { ODDS_FEED_DOC_IDS, type OddsSport } from '@vault/shared';

export function playerDoc(db: Firestore, uid: string) {
  return db.collection('players').doc(uid);
}

/** `email` must already be lowercased — callers own that normalization. */
export function inviteDoc(db: Firestore, email: string) {
  return db.collection('invites').doc(email);
}

export function seasonDoc(db: Firestore, seasonId: string) {
  return db.collection('seasons').doc(seasonId);
}

export function weeksCol(db: Firestore, seasonId: string) {
  return seasonDoc(db, seasonId).collection('weeks');
}

export function weekDoc(db: Firestore, seasonId: string, weekId: string) {
  return weeksCol(db, seasonId).doc(weekId);
}

export function buyInsCol(db: Firestore, seasonId: string, weekId: string) {
  return weekDoc(db, seasonId, weekId).collection('buyIns');
}

export function buyInDoc(db: Firestore, seasonId: string, weekId: string, uid: string) {
  return buyInsCol(db, seasonId, weekId).doc(uid);
}

export function picksCol(db: Firestore, seasonId: string, weekId: string) {
  return weekDoc(db, seasonId, weekId).collection('picks');
}

export function pickDoc(db: Firestore, seasonId: string, weekId: string, uid: string) {
  return picksCol(db, seasonId, weekId).doc(uid);
}

export function bookBetsCol(db: Firestore, seasonId: string, weekId: string) {
  return weekDoc(db, seasonId, weekId).collection('bookBets');
}

export function bookBetDoc(db: Firestore, seasonId: string, weekId: string, betId: string) {
  return bookBetsCol(db, seasonId, weekId).doc(betId);
}

export function ledgerCol(db: Firestore, seasonId: string) {
  return seasonDoc(db, seasonId).collection('ledger');
}

export function standingsCol(db: Firestore, seasonId: string) {
  return seasonDoc(db, seasonId).collection('standings');
}

export function standingDoc(db: Firestore, seasonId: string, uid: string) {
  return standingsCol(db, seasonId).doc(uid);
}

export function preloadsCol(db: Firestore, seasonId: string) {
  return seasonDoc(db, seasonId).collection('preloads');
}

export function preloadDoc(db: Firestore, seasonId: string, uid: string) {
  return preloadsCol(db, seasonId).doc(uid);
}

/** The latest DraftKings lines from The Odds API (see @vault/shared oddsFeed). */
export function oddsFeedDoc(db: Firestore, sport: OddsSport = 'nfl') {
  return db.collection('odds').doc(ODDS_FEED_DOC_IDS[sport]);
}

export function oddsSettingsDoc(db: Firestore) {
  return db.collection('odds').doc('settings');
}

export function oddsUsageCol(db: Firestore) {
  return db.collection('oddsUsage');
}

export function oddsUsageDoc(db: Firestore, monthKey: string) {
  return oddsUsageCol(db).doc(monthKey);
}
