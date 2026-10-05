/**
 * firestore.rules tests (SPEC.md §6 / Milestone 4 done-when):
 *   - other players' picks are hidden while the week is `open`, visible once locked
 *   - clients cannot write any protected field
 *
 * ("non-invited users are rejected" is the `beforeUserCreated` blocking
 * function, which is an Auth trigger rather than a Firestore rule — it's
 * covered by functions/test/invites.test.ts against the Auth+Functions
 * emulators instead.)
 */
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { makeTestEnv } from './helpers/env.js';

const SEASON = 'S1';
const WEEK = 'W1';

describe('firestore.rules', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await makeTestEnv();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const now = Timestamp.now();

      await setDoc(doc(db, 'players/P1'), {
        displayName: 'P1',
        email: 'p1@example.com',
        isAdmin: false,
        createdAt: now,
      });
      await setDoc(doc(db, 'players/P2'), {
        displayName: 'P2',
        email: 'p2@example.com',
        isAdmin: false,
        createdAt: now,
      });

      await setDoc(doc(db, `seasons/${SEASON}`), {
        name: 'Test season',
        startWeek: 4,
        status: 'active',
        sharpPct: 0.1,
        bookCapPct: 0.25,
        currentWeekId: WEEK,
        totalShares: 20,
        vaultCents: 2000,
        sharePrice: 1,
      });

      await setDoc(doc(db, `seasons/${SEASON}/weeks/${WEEK}`), {
        nflWeek: 4,
        type: 'regular',
        order: 0,
        buyInCents: 1000,
        lockAt: now,
        status: 'open',
        bookholderId: 'P1',
        submittedPlayerIds: ['P1', 'P2'],
        sharePriceAtOpen: 1,
        openingVaultCents: 0,
        bookCapCents: 0,
        bookNetCents: 0,
        closingVaultCents: 0,
        closingSharePrice: 0,
        totalSharesAtClose: 0,
        nextBookholderId: '',
        bookDecision: { rule: 'all_losses_keep', candidates: [], tiebreakUsed: 'none' },
      });

      await setDoc(doc(db, `seasons/${SEASON}/weeks/${WEEK}/picks/P1`), {
        playerId: 'P1',
        pickText: 'Bears -2.5',
        gameText: 'CHI vs CAR',
        americanOdds: -138,
        submittedAt: now,
        updatedAt: now,
        result: 'pending',
        units: null,
      });
      await setDoc(doc(db, `seasons/${SEASON}/weeks/${WEEK}/picks/P2`), {
        playerId: 'P2',
        pickText: 'DET -3',
        gameText: 'DET vs NO',
        americanOdds: -112,
        submittedAt: now,
        updatedAt: now,
        result: 'pending',
        units: null,
      });

      await setDoc(doc(db, `seasons/${SEASON}/weeks/${WEEK}/buyIns/P1`), {
        amountCents: 1000,
        paid: true,
        paidAt: now,
        sharePrice: 1,
        sharesIssued: 10,
        markedBy: 'ADMIN',
      });

      await setDoc(doc(db, `seasons/${SEASON}/weeks/${WEEK}/bookBets/B1`), {
        legPickIds: ['P1'],
        stakeCents: 500,
        ticketOdds: -110,
        payoutCents: null,
        result: 'pending',
        netCents: null,
        placedBy: 'P1',
        placedAt: now,
      });

      await setDoc(doc(db, `seasons/${SEASON}/ledger/L1`), {
        type: 'buy_in',
        weekId: WEEK,
        playerId: 'P1',
        amountCents: 1000,
        note: 'test',
        createdAt: now,
        createdBy: 'ADMIN',
      });

      await setDoc(doc(db, `seasons/${SEASON}/standings/P1`), {
        playerId: 'P1',
        displayName: 'P1',
        wins: 0,
        losses: 0,
        pushes: 0,
        units: 0,
        weeksBoughtIn: 1,
        shares: 10,
      });

      await setDoc(doc(db, 'invites/admin@example.com'), { invitedBy: 'script', invitedAt: now });
    });
  });

  function asPlayer(uid: string) {
    return testEnv.authenticatedContext(uid);
  }

  function asAdmin(uid = 'ADMIN') {
    return testEnv.authenticatedContext(uid, { admin: true });
  }

  function anon() {
    return testEnv.unauthenticatedContext();
  }

  describe('pick visibility (SPEC.md §1.1)', () => {
    it("hides another player's pick while the week is open", async () => {
      const p1 = asPlayer('P1');
      await assertFails(getDoc(doc(p1.firestore(), `seasons/${SEASON}/weeks/${WEEK}/picks/P2`)));
    });

    it('lets a player read their own pick while the week is open', async () => {
      const p1 = asPlayer('P1');
      await assertSucceeds(getDoc(doc(p1.firestore(), `seasons/${SEASON}/weeks/${WEEK}/picks/P1`)));
    });

    it('lets an admin read any pick while the week is open', async () => {
      const admin = asAdmin();
      await assertSucceeds(getDoc(doc(admin.firestore(), `seasons/${SEASON}/weeks/${WEEK}/picks/P2`)));
    });

    it('reveals every pick once the week is locked', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), `seasons/${SEASON}/weeks/${WEEK}`), { status: 'locked' });
      });
      const p1 = asPlayer('P1');
      await assertSucceeds(getDoc(doc(p1.firestore(), `seasons/${SEASON}/weeks/${WEEK}/picks/P2`)));
    });

    it('denies a signed-out reader entirely', async () => {
      await assertFails(getDoc(doc(anon().firestore(), `seasons/${SEASON}/weeks/${WEEK}/picks/P1`)));
    });
  });

  describe('clients cannot write protected fields (SPEC.md §6)', () => {
    it('rejects a client writing a buy-in', async () => {
      const p1 = asPlayer('P1');
      await assertFails(setDoc(doc(p1.firestore(), `seasons/${SEASON}/weeks/${WEEK}/buyIns/P1`), { paid: true }));
    });

    it('rejects a client writing a ledger entry', async () => {
      const p1 = asPlayer('P1');
      await assertFails(setDoc(doc(p1.firestore(), `seasons/${SEASON}/ledger/fake`), { amountCents: 100 }));
    });

    it('rejects a client writing standings', async () => {
      const p1 = asPlayer('P1');
      await assertFails(updateDoc(doc(p1.firestore(), `seasons/${SEASON}/standings/P1`), { units: 99 }));
    });

    it('rejects a client writing a book bet', async () => {
      const p1 = asPlayer('P1');
      await assertFails(setDoc(doc(p1.firestore(), `seasons/${SEASON}/weeks/${WEEK}/bookBets/fake`), { stakeCents: 1 }));
    });

    it("rejects a client editing a pick's result/units directly", async () => {
      const p1 = asPlayer('P1');
      await assertFails(
        updateDoc(doc(p1.firestore(), `seasons/${SEASON}/weeks/${WEEK}/picks/P1`), { result: 'win', units: 1 }),
      );
    });

    it('rejects a client writing season money fields', async () => {
      const p1 = asPlayer('P1');
      await assertFails(updateDoc(doc(p1.firestore(), `seasons/${SEASON}`), { vaultCents: 999999 }));
    });

    it('rejects a client writing week lifecycle/money fields', async () => {
      const p1 = asPlayer('P1');
      await assertFails(updateDoc(doc(p1.firestore(), `seasons/${SEASON}/weeks/${WEEK}`), { status: 'closed' }));
    });

    it('lets a player update only their own displayName', async () => {
      const p1 = asPlayer('P1');
      await assertSucceeds(updateDoc(doc(p1.firestore(), 'players/P1'), { displayName: 'New Name' }));
    });

    it('rejects a player changing any other field on their own player doc', async () => {
      const p1 = asPlayer('P1');
      await assertFails(updateDoc(doc(p1.firestore(), 'players/P1'), { isAdmin: true }));
    });

    it("rejects a player updating someone else's player doc", async () => {
      const p1 = asPlayer('P1');
      await assertFails(updateDoc(doc(p1.firestore(), 'players/P2'), { displayName: 'Hijacked' }));
    });
  });

  describe('invites (SPEC.md §6 membership allowlist)', () => {
    it('denies a non-admin any access to invites', async () => {
      const p1 = asPlayer('P1');
      await assertFails(getDoc(doc(p1.firestore(), 'invites/admin@example.com')));
      await assertFails(
        setDoc(doc(p1.firestore(), 'invites/new@example.com'), { invitedBy: 'P1', invitedAt: Timestamp.now() }),
      );
    });

    it('lets an admin manage invites', async () => {
      const admin = asAdmin();
      await assertSucceeds(
        setDoc(doc(admin.firestore(), 'invites/new@example.com'), { invitedBy: 'ADMIN', invitedAt: Timestamp.now() }),
      );
      await assertSucceeds(getDoc(doc(admin.firestore(), 'invites/new@example.com')));
    });
  });

  describe("comments (Kade's Comment Section)", () => {
    it('lets a signed-in player post as themselves', async () => {
      const p1 = asPlayer('P1');
      await assertSucceeds(
        addDoc(collection(p1.firestore(), 'comments'), {
          authorId: 'P1',
          authorName: 'P1',
          text: 'hello crew',
          createdAt: Timestamp.now(),
        }),
      );
    });

    it('rejects posting as someone else', async () => {
      const p1 = asPlayer('P1');
      await assertFails(
        addDoc(collection(p1.firestore(), 'comments'), {
          authorId: 'P2',
          authorName: 'P2',
          text: 'hello crew',
          createdAt: Timestamp.now(),
        }),
      );
    });

    it('rejects an empty or overlong comment', async () => {
      const p1 = asPlayer('P1');
      await assertFails(
        addDoc(collection(p1.firestore(), 'comments'), {
          authorId: 'P1',
          authorName: 'P1',
          text: '',
          createdAt: Timestamp.now(),
        }),
      );
      await assertFails(
        addDoc(collection(p1.firestore(), 'comments'), {
          authorId: 'P1',
          authorName: 'P1',
          text: 'x'.repeat(1001),
          createdAt: Timestamp.now(),
        }),
      );
    });

    it('denies an unauthenticated user any access', async () => {
      await assertFails(
        addDoc(collection(anon().firestore(), 'comments'), {
          authorId: 'P1',
          authorName: 'P1',
          text: 'hello crew',
          createdAt: Timestamp.now(),
        }),
      );
    });

    it('lets the author delete their own comment, but not another player', async () => {
      const p1 = asPlayer('P1');
      const ref = await addDoc(collection(p1.firestore(), 'comments'), {
        authorId: 'P1',
        authorName: 'P1',
        text: 'hello crew',
        createdAt: Timestamp.now(),
      });

      const p2 = asPlayer('P2');
      await assertFails(deleteDoc(doc(p2.firestore(), `comments/${ref.id}`)));
      await assertSucceeds(deleteDoc(doc(p1.firestore(), `comments/${ref.id}`)));
    });

    it('lets an admin delete any comment', async () => {
      const p1 = asPlayer('P1');
      const ref = await addDoc(collection(p1.firestore(), 'comments'), {
        authorId: 'P1',
        authorName: 'P1',
        text: 'hello crew',
        createdAt: Timestamp.now(),
      });

      const admin = asAdmin();
      await assertSucceeds(deleteDoc(doc(admin.firestore(), `comments/${ref.id}`)));
    });
  });

  describe('mail (Trigger Email from Firestore extension queue)', () => {
    it('lets an admin queue a message but not read it back', async () => {
      const admin = asAdmin();
      const ref = await assertSucceeds(
        addDoc(collection(admin.firestore(), 'mail'), { to: ['new@example.com'], message: { subject: 'x', html: '<p>x</p>' } }),
      );
      await assertFails(getDoc(doc(admin.firestore(), `mail/${ref.id}`)));
    });

    it('denies a non-admin any access to mail', async () => {
      const p1 = asPlayer('P1');
      await assertFails(
        addDoc(collection(p1.firestore(), 'mail'), { to: ['new@example.com'], message: { subject: 'x', html: '<p>x</p>' } }),
      );
    });
  });

  describe('odds feed (The Odds API)', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'odds/feed'), { games: [], pulledAt: Timestamp.now(), bookmaker: 'draftkings' });
        await setDoc(doc(db, 'odds/feedNcaaf'), { games: [], pulledAt: Timestamp.now(), bookmaker: 'draftkings' });
        await setDoc(doc(db, 'odds/settings'), { paused: false });
        await setDoc(doc(db, 'oddsUsage/2026-10'), { monthKey: '2026-10', calls: 1, creditsUsed: 3 });
      });
    });

    it('lets any signed-in player read the feed, but not anonymous users', async () => {
      await assertSucceeds(getDoc(doc(asPlayer('P1').firestore(), 'odds/feed')));
      await assertFails(getDoc(doc(anon().firestore(), 'odds/feed')));
      await assertSucceeds(getDoc(doc(asPlayer('P1').firestore(), 'odds/feedNcaaf')));
      await assertFails(getDoc(doc(anon().firestore(), 'odds/feedNcaaf')));
    });

    it('keeps usage and settings Admin-only', async () => {
      const p1 = asPlayer('P1').firestore();
      await assertFails(getDoc(doc(p1, 'oddsUsage/2026-10')));
      await assertFails(getDoc(doc(p1, 'odds/settings')));

      const admin = asAdmin().firestore();
      await assertSucceeds(getDoc(doc(admin, 'oddsUsage/2026-10')));
      await assertSucceeds(getDoc(doc(admin, 'odds/settings')));
    });

    it('denies every client write, even from an Admin', async () => {
      const admin = asAdmin().firestore();
      await assertFails(setDoc(doc(admin, 'odds/feed'), { games: [] }));
      await assertFails(updateDoc(doc(admin, 'odds/settings'), { paused: true }));
      await assertFails(updateDoc(doc(admin, 'oddsUsage/2026-10'), { creditsUsed: 0 }));
      await assertFails(setDoc(doc(asPlayer('P1').firestore(), 'odds/feed'), { games: [] }));
      await assertFails(setDoc(doc(admin, 'odds/feedNcaaf'), { games: [] }));
    });
  });
  describe('push notifications', () => {
    const token = (uid: string) => ({ uid, platform: 'test', createdAt: Timestamp.now() });

    it('lets a player register, read and remove only their own device tokens', async () => {
      const p1 = asPlayer('P1').firestore();
      await assertSucceeds(setDoc(doc(p1, 'pushTokens/tok-1'), token('P1')));
      await assertSucceeds(getDoc(doc(p1, 'pushTokens/tok-1')));
      await assertFails(getDoc(doc(asPlayer('P2').firestore(), 'pushTokens/tok-1')));
      await assertFails(deleteDoc(doc(asPlayer('P2').firestore(), 'pushTokens/tok-1')));
      await assertFails(setDoc(doc(asPlayer('P2').firestore(), 'pushTokens/tok-1'), token('P2')));
      await assertSucceeds(deleteDoc(doc(p1, 'pushTokens/tok-1')));
    });

    it("rejects a token filed under someone else's uid or with extra fields", async () => {
      const p1 = asPlayer('P1').firestore();
      await assertFails(setDoc(doc(p1, 'pushTokens/tok-2'), token('P2')));
      await assertFails(setDoc(doc(p1, 'pushTokens/tok-3'), { ...token('P1'), admin: true }));
      await assertFails(setDoc(doc(anon().firestore(), 'pushTokens/tok-4'), token('P1')));
    });

    it('lets a player set only their own notification switches, as booleans', async () => {
      const p1 = asPlayer('P1').firestore();
      await assertSucceeds(setDoc(doc(p1, 'notificationPrefs/P1'), { reminders: false, bookIn: true }));
      await assertSucceeds(getDoc(doc(p1, 'notificationPrefs/P1')));
      await assertFails(getDoc(doc(asPlayer('P2').firestore(), 'notificationPrefs/P1')));
      await assertFails(setDoc(doc(asPlayer('P2').firestore(), 'notificationPrefs/P1'), { reminders: true }));
      await assertFails(setDoc(doc(p1, 'notificationPrefs/P1'), { reminders: 'yes' }));
      await assertFails(setDoc(doc(p1, 'notificationPrefs/P1'), { spam: true }));
    });
  });
});
