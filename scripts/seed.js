/**
 * Emulator seed script. Fake data only — never point this at production.
 *
 * Refuses to run unless FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
 * are set, which the Emulator Suite does for you. The SPEC.md §9.1 reference
 * week belongs to a different group and is test-only: it lives in the unit and
 * emulator tests, never here.
 *
 * Creates 5 fake Auth users (fixed uids so re-running is idempotent), an
 * invites/{email} doc for each, players/{uid} docs (normally provisioned by
 * the beforeUserCreated blocking function — skipped here since these
 * accounts are created directly via the Admin SDK), the test1 Admin claim,
 * an active season starting at Week 4, and buy-ins paid for everyone but the
 * last player (so the UI's unpaid/disabled state has something to show).
 *
 * Usage: npm run seed
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { DEFAULT_BUY_IN_CENTS, sharesForBuyIn } from '@vault/shared';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'the-vault-f417a';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Refusing to seed: emulator host env vars are not set.');
  process.exit(1);
}

/** Obviously-fake players, per CLAUDE.md. test1 is the Admin and Week 4 Bookholder. */
export const SEED_PLAYERS = [
  { uid: 'test1', email: 'test1@example.com', displayName: 'Test One', isAdmin: true },
  { uid: 'test2', email: 'test2@example.com', displayName: 'Test Two', isAdmin: false },
  { uid: 'test3', email: 'test3@example.com', displayName: 'Test Three', isAdmin: false },
  { uid: 'test4', email: 'test4@example.com', displayName: 'Test Four', isAdmin: false },
  { uid: 'test5', email: 'test5@example.com', displayName: 'Test Five', isAdmin: false },
];

const SEASON_ID = '2026';
const WEEK_ID = 'W04';
const BUY_IN_CENTS = 1000; // regular season (SPEC.md §1.1)
const SHARE_PRICE_AT_OPEN = 1.0; // first week of the first season (SPEC.md §1.5)
const LOCK_AT_MS = Date.now() + 6 * 60 * 60 * 1000; // 6h out, so picks can be tested live

console.log(`Seed target: project "${PROJECT_ID}" on ${process.env.FIRESTORE_EMULATOR_HOST}`);

initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

async function upsertAuthUser({ uid, email, displayName }) {
  try {
    await auth.getUser(uid);
  } catch {
    await auth.createUser({ uid, email, displayName, emailVerified: true });
  }
}

async function seedPlayersAndInvites() {
  const now = Timestamp.now();
  for (const p of SEED_PLAYERS) {
    await upsertAuthUser(p);
    if (p.isAdmin) {
      await auth.setCustomUserClaims(p.uid, { admin: true });
    }
    await db.collection('invites').doc(p.email).set({
      invitedBy: 'seed script',
      invitedAt: now,
      displayName: p.displayName,
    });
    await db.collection('players').doc(p.uid).set({
      displayName: p.displayName,
      email: p.email,
      isAdmin: p.isAdmin,
      createdAt: now,
    });
  }
  console.log(`Seeded ${SEED_PLAYERS.length} players/invites.`);
}

async function seedSeasonAndWeek() {
  const seasonRef = db.collection('seasons').doc(SEASON_ID);
  if ((await seasonRef.get()).exists) {
    console.log(`Season ${SEASON_ID} already exists, skipping season/week/buy-in seed.`);
    return false;
  }

  await seasonRef.set({
    name: 'The Vault — 2026',
    startWeek: 4,
    status: 'active',
    sharpPct: 0.1,
    bookCapPct: 0.25,
    currentWeekId: WEEK_ID,
    totalShares: 0,
    vaultCents: 0,
    sharePrice: SHARE_PRICE_AT_OPEN,
    buyInDefaultsCents: DEFAULT_BUY_IN_CENTS,
    requiredPreloadCents: 0,
  });

  await seasonRef.collection('weeks').doc(WEEK_ID).set({
    nflWeek: 4,
    type: 'regular',
    order: 0,
    buyInCents: BUY_IN_CENTS,
    lockAt: Timestamp.fromMillis(LOCK_AT_MS),
    status: 'open',
    bookholderId: 'test1',
    submittedPlayerIds: [],
    sharePriceAtOpen: SHARE_PRICE_AT_OPEN,
    openingVaultCents: 0,
    bookCapCents: 0,
    bookNetCents: 0,
    closingVaultCents: 0,
    closingSharePrice: 0,
    totalSharesAtClose: 0,
    nextBookholderId: '',
    bookDecision: { rule: 'all_losses_keep', candidates: [], tiebreakUsed: 'none' },
  });

  console.log(`Created season ${SEASON_ID} and week ${WEEK_ID} (open).`);
  return true;
}

/** Mirrors markBuyInPaidLogic's writes (functions/src/logic/buyIns.ts) without the transaction, since this is a one-shot seed. */
async function seedBuyIns() {
  const now = Timestamp.now();
  const paidPlayers = SEED_PLAYERS.slice(0, -1); // everyone but the last player stays unpaid
  let totalSharesAdded = 0;
  let vaultCentsAdded = 0;

  for (const p of paidPlayers) {
    const shares = sharesForBuyIn(BUY_IN_CENTS, SHARE_PRICE_AT_OPEN);
    await db
      .collection('seasons')
      .doc(SEASON_ID)
      .collection('weeks')
      .doc(WEEK_ID)
      .collection('buyIns')
      .doc(p.uid)
      .set({
        amountCents: BUY_IN_CENTS,
        paid: true,
        paidAt: now,
        sharePrice: SHARE_PRICE_AT_OPEN,
        sharesIssued: shares,
        markedBy: 'seed script',
      });

    await db.collection('seasons').doc(SEASON_ID).collection('standings').doc(p.uid).set({
      playerId: p.uid,
      displayName: p.displayName,
      wins: 0,
      losses: 0,
      pushes: 0,
      units: 0,
      weeksBoughtIn: 1,
      shares,
    });

    await db.collection('seasons').doc(SEASON_ID).collection('ledger').doc().set({
      type: 'buy_in',
      weekId: WEEK_ID,
      playerId: p.uid,
      amountCents: BUY_IN_CENTS,
      note: `Buy-in paid for ${WEEK_ID}`,
      createdAt: now,
      createdBy: 'seed script',
    });

    totalSharesAdded += shares;
    vaultCentsAdded += BUY_IN_CENTS;
  }

  await db.collection('seasons').doc(SEASON_ID).update({
    totalShares: totalSharesAdded,
    vaultCents: vaultCentsAdded,
  });

  console.log(
    `Marked ${paidPlayers.length} buy-ins paid ($${(vaultCentsAdded / 100).toFixed(2)} in the Vault). ${SEED_PLAYERS.at(-1).displayName} is left unpaid.`,
  );
}

/**
 * A made-up odds/feed doc so the Pick screen's board has something to show
 * without calling The Odds API (the emulator never has a real key). Lines are
 * invented; kickoffs are relative to the seeded week's lock.
 */
async function seedOddsFeed() {
  const HOUR = 3_600_000;
  const weekSnap = await db.collection('seasons').doc(SEASON_ID).collection('weeks').doc(WEEK_ID).get();
  const lockAtMs = weekSnap.get('lockAt')?.toMillis() ?? LOCK_AT_MS;
  const game = (eventId, awayTeam, homeTeam, hoursAfterLock, spread, total) => ({
    eventId,
    awayTeam,
    homeTeam,
    commenceAt: Timestamp.fromMillis(lockAtMs + hoursAfterLock * HOUR),
    lines: {
      spreadAway: { odds: -110, point: spread },
      spreadHome: { odds: -110, point: -spread },
      mlAway: { odds: spread < 0 ? -150 : 130, point: null },
      mlHome: { odds: spread < 0 ? 130 : -150, point: null },
      over: { odds: -108, point: total },
      under: { odds: -112, point: total },
    },
  });
  await db.collection('odds').doc('feed').set({
    bookmaker: 'draftkings',
    pulledAt: Timestamp.now(),
    games: [
      game('seed-1', 'Chicago Bears', 'Carolina Panthers', 2, -2.5, 47.5),
      game('seed-2', 'New Orleans Saints', 'Detroit Lions', 2, 6.5, 49.5),
      game('seed-3', 'Philadelphia Eagles', 'Washington Commanders', 5.4, -3, 44.5),
      game('seed-4', 'Buffalo Bills', 'Kansas City Chiefs', 9.3, 1, 51),
      game('seed-5', 'Seattle Seahawks', 'San Francisco 49ers', 33.25, 3.5, 43.5),
    ],
  });
  // College names don't shorten to codes, so these exercise the long-name layout.
  await db.collection('odds').doc('feedNcaaf').set({
    bookmaker: 'draftkings',
    pulledAt: Timestamp.now(),
    games: [
      game('seed-cfb-1', 'Alabama Crimson Tide', 'Georgia Bulldogs', 3, 3.5, 52.5),
      game('seed-cfb-2', 'Ohio State Buckeyes', 'Michigan Wolverines', 20, -7, 44.5),
      game('seed-cfb-3', 'Arizona State Sun Devils', 'North Carolina Tar Heels', 24, 2.5, 57),
    ],
  });
  console.log('Seeded a fake odds/feed with 5 games and odds/feedNcaaf with 3.');
}

await seedPlayersAndInvites();
const seasonIsNew = await seedSeasonAndWeek();
if (seasonIsNew) {
  await seedBuyIns();
}
await seedOddsFeed();

console.log('\nSign in as any of these (invite-only, Google or email-link):');
for (const p of SEED_PLAYERS) console.log(`  ${p.email}${p.isAdmin ? '  (Admin, Week 4 Bookholder)' : ''}`);
