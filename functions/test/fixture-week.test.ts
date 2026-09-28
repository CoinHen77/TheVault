import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import type { BuyIn, Season, Standing, Week } from '@vault/shared';
import { markBuyInPaidLogic } from '../src/logic/buyIns.js';
import { placeBookBetLogic, gradeBookBetLogic } from '../src/logic/bookBets.js';
import { lockDueWeeksLogic } from '../src/logic/lock.js';
import { gradePickLogic, submitPickLogic } from '../src/logic/picks.js';
import { createSeasonLogic } from '../src/logic/season.js';
import { closeWeekLogic, startGradingLogic } from '../src/logic/weekLifecycle.js';
import { buyInDoc, seasonDoc, standingDoc, weekDoc } from '../src/paths.js';
import { clearFirestore, db } from './helpers/emulator.js';
import { seedPlayers } from './helpers/seed.js';

/**
 * SPEC.md §9.1 — the reference week, run end to end through the real Cloud
 * Functions logic against the Firestore emulator (not just the pure /shared
 * math, which shared/test/fixture-week.test.ts already covers).
 *
 * This fixture is from a different group and is test-only (CLAUDE.md):
 * never seeded into production.
 */
describe('§9.1 reference week, run through the Cloud Functions', () => {
  const SEASON_ID = 'fixture-season';
  const WEEK_ID = 'W04';

  const PICKS = [
    { playerId: 'P1', pickText: 'Bears -2.5', gameText: 'CHI vs CAR', odds: -138, result: 'win' as const },
    { playerId: 'P2', pickText: 'DET vs NO Over 49.5', gameText: 'DET vs NO', odds: -112, result: 'win' as const },
    { playerId: 'P3', pickText: 'Jameson Williams Anytime TD', gameText: 'DET vs NO', odds: 170, result: 'loss' as const },
    { playerId: 'P4', pickText: 'WAS vs PHI Under 44.5', gameText: 'WAS vs PHI', odds: -115, result: 'loss' as const },
    { playerId: 'P5', pickText: 'Dallas -3', gameText: 'DAL vs NYG', odds: -112, result: 'loss' as const },
    { playerId: 'P6', pickText: 'Chris Olave 6+ Receptions', gameText: 'NO vs DET', odds: -174, result: 'win' as const },
    { playerId: 'P7', pickText: 'CHI vs CAR Under 47.5', gameText: 'CHI vs CAR', odds: -110, result: 'loss' as const },
    { playerId: 'P8', pickText: 'Emeka Egbuka Anytime TD', gameText: 'TB vs ATL', odds: 180, result: 'loss' as const },
  ];

  beforeEach(async () => {
    await clearFirestore();
    await seedPlayers(PICKS.map((p) => p.playerId));
  });

  it('produces a $60 closing Vault, $0.75 share price, and Bookholder P2', async () => {
    const lockAtMs = Date.now() + 60_000;
    await createSeasonLogic(db, {
      seasonId: SEASON_ID,
      name: 'Fixture season',
      adminUid: 'P2', // this fixture's own Bookholder, per §9.1 — not a real Admin claim
      week4LockAtMs: lockAtMs,
    });

    for (const p of PICKS) {
      await markBuyInPaidLogic(db, { seasonId: SEASON_ID, weekId: WEEK_ID, playerId: p.playerId, markedBy: 'admin' });
    }

    const openAfterBuyIns = (await seasonDoc(db, SEASON_ID).get()).data() as Season;
    expect(openAfterBuyIns.vaultCents).toBe(8000);
    expect(openAfterBuyIns.totalShares).toBe(80);

    for (const p of PICKS) {
      await submitPickLogic(db, {
        seasonId: SEASON_ID,
        weekId: WEEK_ID,
        uid: p.playerId,
        pickText: p.pickText,
        gameText: p.gameText,
        americanOdds: p.odds,
      });
    }

    await lockDueWeeksLogic(db, { nowMs: lockAtMs + 1 });

    const lockedWeek = (await weekDoc(db, SEASON_ID, WEEK_ID).get()).data() as Week;
    expect(lockedWeek.status).toBe('locked');
    expect(lockedWeek.openingVaultCents).toBe(8000);
    expect(lockedWeek.bookCapCents).toBe(2000);

    const { betId } = await placeBookBetLogic(db, {
      seasonId: SEASON_ID,
      weekId: WEEK_ID,
      uid: 'P2',
      isAdmin: false,
      legPickIds: PICKS.map((p) => p.playerId),
      stakeCents: 2000,
      ticketOdds: 18054,
    });

    const placedBet = (await weekDoc(db, SEASON_ID, WEEK_ID).collection('bookBets').doc(betId).get()).data();
    expect(placedBet?.payoutCents).toBe(363080); // $3,630.80 default payout, per §9.1

    await startGradingLogic(db, { seasonId: SEASON_ID, weekId: WEEK_ID });

    for (const p of PICKS) {
      await gradePickLogic(db, { seasonId: SEASON_ID, weekId: WEEK_ID, playerId: p.playerId, result: p.result });
    }
    const { netCents } = await gradeBookBetLogic(db, {
      seasonId: SEASON_ID,
      weekId: WEEK_ID,
      betId,
      result: 'loss',
    });
    expect(netCents).toBe(-2000);

    const close = await closeWeekLogic(db, { seasonId: SEASON_ID, weekId: WEEK_ID, adminUid: 'admin' });

    expect(close.bookNetCents).toBe(-2000);
    expect(close.closingVaultCents).toBe(6000);
    expect(close.closingSharePrice).toBe(0.75);
    expect(close.nextBookholderId).toBe('P2');

    const closedWeek = (await weekDoc(db, SEASON_ID, WEEK_ID).get()).data() as Week;
    expect(closedWeek.status).toBe('closed');
    expect(closedWeek.bookDecision.rule).toBe('win');
    expect(closedWeek.bookDecision.tiebreakUsed).toBe('none'); // -112 is the sole longest-odds winner
    expect(closedWeek.nextBookholderId).toBe('P2');

    const season = (await seasonDoc(db, SEASON_ID).get()).data() as Season;
    expect(season.vaultCents).toBe(6000);
    expect(season.sharePrice).toBe(0.75);
    expect(season.currentWeekId).toBe('W05'); // closeWeek auto-creates the next regular week

    const nextWeek = (await weekDoc(db, SEASON_ID, 'W05').get()).data() as Week;
    expect(nextWeek.status).toBe('open');
    expect(nextWeek.bookholderId).toBe('P2');
    expect(nextWeek.sharePriceAtOpen).toBe(0.75);

    const p1Standing = (await standingDoc(db, SEASON_ID, 'P1').get()).data() as Standing;
    expect(p1Standing.wins).toBe(1);
    expect(p1Standing.units).toBeCloseTo(0.72, 2);

    let wins = 0;
    let losses = 0;
    for (const p of PICKS) {
      const s = (await standingDoc(db, SEASON_ID, p.playerId).get()).data() as Standing;
      if (p.result === 'win') wins++;
      if (p.result === 'loss') losses++;
      expect(s.weeksBoughtIn).toBe(1);
    }
    expect([wins, losses]).toEqual([3, 5]);
  });

  it('a second week buy-in issues 13.333333 shares at the $0.75 closing price', async () => {
    // Stand up week W05 directly at the fixture's closing share price, skipping
    // the full week-one flow already exercised by the test above.
    await seasonDoc(db, SEASON_ID).set({
      name: 'Fixture season',
      startWeek: 4,
      status: 'active',
      sharpPct: 0.1,
      bookCapPct: 0.25,
      currentWeekId: 'W05',
      totalShares: 80,
      vaultCents: 6000,
      sharePrice: 0.75,
    });
    await weekDoc(db, SEASON_ID, 'W05').set({
      nflWeek: 5,
      type: 'regular',
      order: 1,
      buyInCents: 1000,
      lockAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'open',
      bookholderId: 'P2',
      sharePriceAtOpen: 0.75,
      openingVaultCents: 0,
      bookCapCents: 0,
      bookNetCents: 0,
      closingVaultCents: 0,
      closingSharePrice: 0,
      totalSharesAtClose: 0,
      nextBookholderId: '',
      bookDecision: { rule: 'all_losses_keep', candidates: [], tiebreakUsed: 'none' },
    });

    const { sharesIssued } = await markBuyInPaidLogic(db, {
      seasonId: SEASON_ID,
      weekId: 'W05',
      playerId: 'P5',
      markedBy: 'admin',
    });

    expect(sharesIssued).toBe(13.333333);
    const buyIn = (await buyInDoc(db, SEASON_ID, 'W05', 'P5').get()).data() as BuyIn;
    expect(buyIn.sharesIssued).toBe(13.333333);
    expect(buyIn.sharePrice).toBe(0.75);
  });

  it('gradeBookBet accepts and uses a ticket-override payout', async () => {
    await seedPlayers(['A']);
    await createSeasonLogic(db, { seasonId: 'override-season', name: 'Override', adminUid: 'A', week4LockAtMs: Date.now() + 60_000 });
    await markBuyInPaidLogic(db, { seasonId: 'override-season', weekId: 'W04', playerId: 'A', markedBy: 'admin' });
    await submitPickLogic(db, {
      seasonId: 'override-season',
      weekId: 'W04',
      uid: 'A',
      pickText: 'Chiefs -3',
      gameText: 'KC vs LV',
      americanOdds: 18054,
    });
    await lockDueWeeksLogic(db, { nowMs: Date.now() + 61_000 });

    // Single $10 buy-in -> $10 Opening Vault -> $2.50 cap; keep the stake within it.
    const { betId } = await placeBookBetLogic(db, {
      seasonId: 'override-season',
      weekId: 'W04',
      uid: 'A',
      isAdmin: false,
      legPickIds: ['A'],
      stakeCents: 200,
      ticketOdds: 18054,
    });
    await startGradingLogic(db, { seasonId: 'override-season', weekId: 'W04' });

    const defaultPayoutCents = 200 * (18054 / 100 + 1); // $362.08 default, mirroring §9.1's ratio
    const overridePayoutCents = Math.round(defaultPayoutCents) + 2; // an arbitrary ticket-override, per §9.1's spirit

    const { netCents } = await gradeBookBetLogic(db, {
      seasonId: 'override-season',
      weekId: 'W04',
      betId,
      result: 'win',
      payoutCentsOverride: overridePayoutCents,
    });

    expect(netCents).toBe(overridePayoutCents - 200);
    const bet = (await weekDoc(db, 'override-season', 'W04').collection('bookBets').doc(betId).get()).data();
    expect(bet?.payoutCents).toBe(overridePayoutCents);
  });
});
