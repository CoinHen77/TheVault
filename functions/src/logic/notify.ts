import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  bookInMessage,
  dueReminder,
  notifyWeekName,
  prefsWithDefaults,
  reminderMessage,
  vaultOpenMessage,
  weekResultsMessage,
  type BookBet,
  type NotificationPrefs,
  type NotifyKind,
  type Pick as PickDoc,
  type PushMessage,
  type Season,
  type Week,
} from '@vault/shared';
import { bookBetsCol, buyInsCol, picksCol, seasonDoc, weekDoc } from '../paths.js';

/**
 * Delivers one message to a set of device tokens. The real one wraps FCM
 * (see push.ts); tests pass a fake. Returns tokens FCM says are gone, so they
 * can be deleted.
 */
export interface PushSender {
  send(tokens: string[], message: PushMessage): Promise<{ deadTokens: string[] }>;
}

export interface Recipient {
  uid: string;
  message: PushMessage;
}

/**
 * Sends each recipient their message on every device they've turned on,
 * skipping anyone who switched this kind off, and deletes dead tokens.
 */
export async function notifyUsers(
  db: Firestore,
  sender: PushSender,
  kind: NotifyKind,
  recipients: Recipient[],
): Promise<{ devices: number }> {
  if (recipients.length === 0) return { devices: 0 };
  const uids = [...new Set(recipients.map((r) => r.uid))];

  const prefSnaps = await db.getAll(...uids.map((uid) => db.collection('notificationPrefs').doc(uid)));
  const enabled = new Set(
    prefSnaps
      .filter((s) => prefsWithDefaults(s.exists ? (s.data() as Partial<NotificationPrefs>) : null)[kind])
      .map((s) => s.id),
  );

  const tokensByUid = new Map<string, string[]>();
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30).filter((uid) => enabled.has(uid));
    if (chunk.length === 0) continue;
    const snap = await db.collection('pushTokens').where('uid', 'in', chunk).get();
    for (const doc of snap.docs) {
      const uid = doc.get('uid') as string;
      tokensByUid.set(uid, [...(tokensByUid.get(uid) ?? []), doc.id]);
    }
  }

  let devices = 0;
  const dead: string[] = [];
  for (const { uid, message } of recipients) {
    const tokens = enabled.has(uid) ? (tokensByUid.get(uid) ?? []) : [];
    if (tokens.length === 0) continue;
    devices += tokens.length;
    try {
      const result = await sender.send(tokens, message);
      dead.push(...result.deadTokens);
    } catch (err) {
      // One bad send must not stop the rest of the crew's notifications.
      console.error(`push to ${uid} failed`, err);
    }
  }
  await Promise.all(dead.map((token) => db.collection('pushTokens').doc(token).delete()));
  return { devices };
}

/** Everyone in the crew this season (removed players excluded). */
async function crewIds(db: Firestore, season: Season): Promise<string[]> {
  const removed = new Set(season.removedPlayerIds ?? []);
  const players = await db.collection('players').get();
  return players.docs.map((d) => d.id).filter((id) => !removed.has(id));
}

async function displayName(db: Firestore, uid: string): Promise<string> {
  const snap = await db.collection('players').doc(uid).get();
  return (snap.get('displayName') as string | undefined) ?? 'The key holder';
}

/**
 * Seal-your-pick reminders, run from the 5-minute lockDueWeeks schedule.
 * Each reminder is marked sent in a transaction before it goes out, so two
 * overlapping runs can't both send it.
 */
export async function sendDueRemindersLogic(
  db: Firestore,
  sender: PushSender,
  params: { nowMs?: number } = {},
): Promise<{ sent: { weekId: string; key: string; players: number }[] }> {
  const nowMs = params.nowMs ?? Date.now();
  const sent: { weekId: string; key: string; players: number }[] = [];
  const seasons = await db.collection('seasons').where('status', '==', 'active').get();

  for (const seasonSnap of seasons.docs) {
    const weekId = seasonSnap.get('currentWeekId') as string | undefined;
    if (!weekId) continue;
    const weekRef = weekDoc(db, seasonSnap.id, weekId);

    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(weekRef);
      if (!snap.exists) return null;
      const week = snap.data() as Week;
      if (week.status !== 'open') return null;
      const key = dueReminder(week.lockAt.toMillis(), nowMs, week.remindersSent);
      if (!key) return null;
      tx.update(weekRef, { [`remindersSent.${key}`]: true });
      return { key, week };
    });
    if (!claimed) continue;

    const [buyIns, picks] = await Promise.all([
      buyInsCol(db, seasonSnap.id, weekId).where('paid', '==', true).get(),
      picksCol(db, seasonSnap.id, weekId).get(),
    ]);
    const picked = new Set(picks.docs.map((d) => d.id));
    const message = reminderMessage(claimed.key, notifyWeekName(claimed.week), claimed.week.lockAt.toMillis());
    const recipients = buyIns.docs.filter((d) => !picked.has(d.id)).map((d) => ({ uid: d.id, message }));
    await notifyUsers(db, sender, 'reminders', recipients);
    sent.push({ weekId, key: claimed.key, players: recipients.length });
  }
  return { sent };
}

/**
 * Fired on every week-doc update: "the vault is open" when a week goes
 * open → locked (on schedule or early), and the results when it closes.
 */
export async function onWeekUpdatedLogic(
  db: Firestore,
  sender: PushSender,
  params: { seasonId: string; weekId: string; before: Week; after: Week },
): Promise<'vaultOpen' | 'weekResults' | null> {
  const { seasonId, weekId, before, after } = params;
  const seasonSnap = await seasonDoc(db, seasonId).get();
  if (!seasonSnap.exists) return null;
  const season = seasonSnap.data() as Season;

  if (before.status === 'open' && after.status === 'locked') {
    const weekName = notifyWeekName(after);
    const keyHolderName = await displayName(db, after.bookholderId);
    const crew = await crewIds(db, season);
    await notifyUsers(
      db,
      sender,
      'vaultOpen',
      crew.map((uid) => ({ uid, message: vaultOpenMessage(weekName, keyHolderName, uid === after.bookholderId) })),
    );
    return 'vaultOpen';
  }

  if (before.status !== 'closed' && after.status === 'closed') {
    const picks = await picksCol(db, seasonId, weekId).get();
    const record = { w: 0, l: 0, p: 0 };
    for (const doc of picks.docs) {
      const result = (doc.data() as PickDoc).result;
      if (result === 'win') record.w += 1;
      else if (result === 'loss') record.l += 1;
      else if (result === 'push') record.p += 1;
    }
    let nextWeekName: string | null = null;
    if (season.currentWeekId && season.currentWeekId !== weekId) {
      const next = await weekDoc(db, seasonId, season.currentWeekId).get();
      if (next.exists) nextWeekName = notifyWeekName(next.data() as Week);
    }
    const nextKeyHolderName = await displayName(db, after.nextBookholderId);
    const crew = await crewIds(db, season);
    await notifyUsers(
      db,
      sender,
      'weekResults',
      crew.map((uid) => ({
        uid,
        message: weekResultsMessage({
          weekName: notifyWeekName(after),
          record,
          bookNetCents: after.bookNetCents,
          nextKeyHolderName,
          forNextKeyHolder: uid === after.nextBookholderId,
          nextWeekName,
        }),
      })),
    );
    return 'weekResults';
  }

  return null;
}

/**
 * The key holder's "Book's in" button: tells the crew the bets are placed.
 * Only while the vault is open, after at least one bet, and only once.
 */
export async function announceBookLogic(
  db: Firestore,
  sender: PushSender,
  params: { seasonId: unknown; weekId: unknown; uid: string; isAdmin: boolean; nowMs?: number },
): Promise<{ bets: number; stakedCents: number }> {
  const { seasonId, weekId, uid, isAdmin } = params;
  if (typeof seasonId !== 'string' || !seasonId || typeof weekId !== 'string' || !weekId) {
    throw new HttpsError('invalid-argument', 'seasonId and weekId are required.');
  }
  const weekRef = weekDoc(db, seasonId, weekId);

  const { week, bets } = await db.runTransaction(async (tx) => {
    const [weekSnap, betsSnap] = await Promise.all([tx.get(weekRef), tx.get(bookBetsCol(db, seasonId, weekId))]);
    if (!weekSnap.exists) throw new HttpsError('not-found', `Week ${weekId} not found.`);
    const w = weekSnap.data() as Week;
    if (w.bookholderId !== uid && !isAdmin) {
      throw new HttpsError('permission-denied', 'Only the key holder can announce the Book.');
    }
    if (w.status !== 'locked') throw new HttpsError('failed-precondition', 'The Book can only be announced while the vault is open.');
    if (w.bookAnnouncedAt) throw new HttpsError('failed-precondition', "The crew already knows the Book's in.");
    if (betsSnap.empty) throw new HttpsError('failed-precondition', 'Place at least one bet first.');
    tx.update(weekRef, {
      bookAnnouncedAt: params.nowMs !== undefined ? Timestamp.fromMillis(params.nowMs) : FieldValue.serverTimestamp(),
    });
    return { week: w, bets: betsSnap.docs.map((d) => d.data() as BookBet) };
  });

  const stakedCents = bets.reduce((sum, b) => sum + b.stakeCents, 0);
  const seasonSnap = await seasonDoc(db, seasonId).get();
  const crew = await crewIds(db, seasonSnap.data() as Season);
  const message = bookInMessage(await displayName(db, week.bookholderId), bets.length, stakedCents);
  await notifyUsers(
    db,
    sender,
    'bookIn',
    crew.filter((id) => id !== week.bookholderId).map((id) => ({ uid: id, message })),
  );
  return { bets: bets.length, stakedCents };
}
