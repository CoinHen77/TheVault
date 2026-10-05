import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PushMessage, Week } from '@vault/shared';
import { placeBookBetLogic } from '../src/logic/bookBets.js';
import { markBuyInPaidLogic } from '../src/logic/buyIns.js';
import { openVaultEarlyLogic } from '../src/logic/lock.js';
import { announceBookLogic, notifyUsers, onWeekUpdatedLogic, sendDueRemindersLogic, type PushSender } from '../src/logic/notify.js';
import { gradePickLogic, submitPickLogic } from '../src/logic/picks.js';
import { createSeasonLogic } from '../src/logic/season.js';
import { closeWeekLogic, startGradingLogic } from '../src/logic/weekLifecycle.js';
import { weekDoc } from '../src/paths.js';
import { clearFirestore, db } from './helpers/emulator.js';
import { seedPlayers } from './helpers/seed.js';

const SEASON_ID = 'push-season';
const W = { seasonId: SEASON_ID, weekId: 'W04' };
const H = 3_600_000;

/** Records every send instead of calling FCM. Tokens named "dead-*" come back dead. */
function fakeSender() {
  const sent: { tokens: string[]; message: PushMessage }[] = [];
  const sender: PushSender = {
    async send(tokens, message) {
      sent.push({ tokens, message });
      return { deadTokens: tokens.filter((t) => t.startsWith('dead-')) };
    },
  };
  const to = (token: string) => sent.find((s) => s.tokens.includes(token))?.message;
  return { sender, sent, to };
}

async function addToken(uid: string, token = `tok-${uid}`) {
  await db.collection('pushTokens').doc(token).set({ uid, platform: 'test', createdAt: Timestamp.now() });
}

async function week(): Promise<Week> {
  return (await weekDoc(db, SEASON_ID, 'W04').get()).data() as Week;
}

async function pay(uid: string) {
  await markBuyInPaidLogic(db, { ...W, playerId: uid, markedBy: 'admin' });
}

async function seal(uid: string, odds = -110) {
  await submitPickLogic(db, { ...W, uid, pickText: `${uid} pick`, gameText: 'A @ B', americanOdds: odds });
}

let lockAtMs: number;

beforeEach(async () => {
  await clearFirestore();
  await seedPlayers(['P1', 'P2', 'P3']);
  lockAtMs = Date.now() + 3 * 24 * H;
  await createSeasonLogic(db, { seasonId: SEASON_ID, name: 'Push', adminUid: 'P1', week4LockAtMs: lockAtMs });
  await Promise.all(['P1', 'P2', 'P3'].map((uid) => addToken(uid)));
});

describe('notifyUsers', () => {
  it('skips players who turned a kind off and deletes dead tokens', async () => {
    await db.collection('notificationPrefs').doc('P2').set({ bookIn: false });
    await addToken('P3', 'dead-old-phone');
    const { sender, to } = fakeSender();
    const message: PushMessage = { title: 't', body: 'b', tab: 'book' };

    const result = await notifyUsers(db, sender, 'bookIn', ['P1', 'P2', 'P3'].map((uid) => ({ uid, message })));

    expect(result.devices).toBe(3); // P1's phone, P3's phone and P3's dead one
    expect(to('tok-P1')).toBeDefined();
    expect(to('tok-P2')).toBeUndefined();
    expect((await db.collection('pushTokens').doc('dead-old-phone').get()).exists).toBe(false);
    expect((await db.collection('pushTokens').doc('tok-P3').get()).exists).toBe(true);
  });
});

describe('sendDueRemindersLogic', () => {
  it('reminds only paid players without a pick, once per reminder', async () => {
    await pay('P1');
    await pay('P2');
    await seal('P1');
    const { sender, sent, to } = fakeSender();

    await sendDueRemindersLogic(db, sender, { nowMs: lockAtMs - 21 * H });
    expect(sent).toHaveLength(0); // too early

    await sendDueRemindersLogic(db, sender, { nowMs: lockAtMs - 20 * H });
    expect(sent).toHaveLength(1);
    expect(to('tok-P2')).toMatchObject({ title: 'Seal your pick', tab: 'pick' });
    expect((await week()).remindersSent).toEqual({ eve: true });

    await sendDueRemindersLogic(db, sender, { nowMs: lockAtMs - 19 * H });
    expect(sent).toHaveLength(1); // not again

    await sendDueRemindersLogic(db, sender, { nowMs: lockAtMs - H });
    expect(sent).toHaveLength(2);
    expect(sent[1]!.message.title).toBe('Last call');
  });

  it('sends nothing once the vault is open', async () => {
    await pay('P1');
    await seal('P1');
    await openVaultEarlyLogic(db, W);
    const { sender, sent } = fakeSender();
    await sendDueRemindersLogic(db, sender, { nowMs: lockAtMs - H });
    expect(sent).toHaveLength(0);
  });
});

describe('onWeekUpdatedLogic', () => {
  it('tells everyone the vault is open, with a key message for the key holder', async () => {
    await pay('P2');
    await seal('P2');
    const before = await week();
    await openVaultEarlyLogic(db, W);
    const { sender, to } = fakeSender();

    expect(await onWeekUpdatedLogic(db, sender, { ...W, before, after: await week() })).toBe('vaultOpen');
    expect(to('tok-P1')).toMatchObject({ title: 'You hold the key', tab: 'book' }); // P1 is the first key holder
    expect(to('tok-P2')).toMatchObject({ title: 'The vault is open', tab: 'week' });
    expect(to('tok-P3')?.body).toBe('Every Week 4 pick is revealed. P1 is up.');
  });

  it('sends the results at close, and "you earned the key" to the new key holder', async () => {
    await pay('P2');
    await pay('P3');
    await seal('P2', 150);
    await seal('P3', -110);
    await openVaultEarlyLogic(db, W);
    await startGradingLogic(db, W);
    await gradePickLogic(db, { ...W, playerId: 'P2', result: 'win' });
    await gradePickLogic(db, { ...W, playerId: 'P3', result: 'loss' });
    const before = await week();
    await closeWeekLogic(db, { ...W, adminUid: 'P1' });
    const { sender, to } = fakeSender();

    expect(await onWeekUpdatedLogic(db, sender, { ...W, before, after: await week() })).toBe('weekResults');
    expect(to('tok-P2')).toMatchObject({ title: 'You earned the key' });
    expect(to('tok-P2')?.body).toBe('Week 4 is closed. Crew 1-1-0, Book $0.00. You run the Book for Week 5.');
    expect(to('tok-P1')?.body).toBe('Crew 1-1-0, Book $0.00. P2 has the key.');
  });

  it('ignores updates that are not an opening or a close', async () => {
    const before = await week();
    const { sender, sent } = fakeSender();
    expect(await onWeekUpdatedLogic(db, sender, { ...W, before, after: { ...before, buyInCents: 2000 } })).toBeNull();
    expect(sent).toHaveLength(0);
  });
});

describe('announceBookLogic', () => {
  async function openWithBet() {
    await pay('P2');
    await seal('P2');
    await openVaultEarlyLogic(db, W);
    await placeBookBetLogic(db, { ...W, uid: 'P1', isAdmin: false, legPickIds: ['P2'], stakeCents: 200, ticketOdds: -110 });
  }

  it("tells the crew (not the key holder) the Book's in, once", async () => {
    await openWithBet();
    const { sender, to } = fakeSender();

    expect(await announceBookLogic(db, sender, { ...W, uid: 'P1', isAdmin: false })).toEqual({ bets: 1, stakedCents: 200 });
    expect(to('tok-P2')?.body).toBe("P1 placed 1 bet for $2.00. See what's riding.");
    expect(to('tok-P1')).toBeUndefined();
    expect((await week()).bookAnnouncedAt).toBeDefined();

    await expect(announceBookLogic(db, sender, { ...W, uid: 'P1', isAdmin: false })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects anyone but the key holder', async () => {
    await openWithBet();
    const { sender } = fakeSender();
    await expect(announceBookLogic(db, sender, { ...W, uid: 'P2', isAdmin: false })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects before any bet is placed', async () => {
    await pay('P2');
    await seal('P2');
    await openVaultEarlyLogic(db, W);
    const { sender } = fakeSender();
    await expect(announceBookLogic(db, sender, { ...W, uid: 'P1', isAdmin: false })).rejects.toMatchObject({
      message: expect.stringMatching(/at least one bet/),
    });
  });
});
