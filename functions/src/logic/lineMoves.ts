import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  findPickLine,
  lineLabel,
  lineMove,
  lineMoveMessage,
  oddsPickText,
  priceAtOpen,
  type OddsGameBase,
  type OddsSport,
  type Pick as PickDoc,
  type PickLineNow,
  type Week,
} from '@vault/shared';
import { pickDoc, picksCol, weekDoc } from '../paths.js';
import { notifyUsers, type PushSender, type Recipient } from './notify.js';

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/**
 * After each odds pull: updates `lineNow` on every pick in the current week
 * that was sealed from one of this sport's lines. While the vault is still
 * sealed, a player whose line moved enough (see LINE_MOVE_ALERT_CENTS) gets
 * one push per seal; a reseal clears `lineAlertedAt`. After the vault opens
 * the prices still update, for the key holder's Book screen, but nobody is
 * pushed (the picks are already priced at the vault-open line by then).
 * Without a sender (tests), nothing is pushed or marked alerted.
 */
export async function refreshPickLinesLogic(
  db: Firestore,
  sender: PushSender | null,
  params: { sport: OddsSport; games: OddsGameBase[]; nowMs?: number },
): Promise<{ updated: number; alerted: number }> {
  const nowMs = params.nowMs ?? Date.now();
  const checkedAt = Timestamp.fromMillis(nowMs);
  let updated = 0;
  const recipients: Recipient[] = [];

  const seasons = await db.collection('seasons').where('status', '==', 'active').get();
  for (const season of seasons.docs) {
    const weekId = season.get('currentWeekId') as string | undefined;
    if (!weekId) continue;
    const weekSnap = await weekDoc(db, season.id, weekId).get();
    if (!weekSnap.exists) continue;
    const week = weekSnap.data() as Week;
    if (week.status !== 'open' && week.status !== 'locked') continue;
    const canAlert = sender !== null && week.status === 'open' && nowMs < week.lockAt.toMillis();

    const linked = await picksCol(db, season.id, weekId).where('line.sport', '==', params.sport).get();
    for (const linkedSnap of linked.docs) {
      // Re-read in a transaction so a reseal in between is compared against its own odds.
      const alert = await db.runTransaction(async (tx) => {
        const ref = pickDoc(db, season.id, weekId, linkedSnap.id);
        const snap = await tx.get(ref);
        const pick = snap.data() as PickDoc | undefined;
        if (!pick?.line || pick.line.sport !== params.sport) return null;
        const found = findPickLine(params.games, pick.line);
        if (!found) return null;

        const lineNow: PickLineNow = {
          odds: found.line.odds,
          point: found.line.point,
          pickText: oddsPickText(found.game, pick.line.choice, found.line),
          checkedAt,
        };
        const move = lineMove({ odds: pick.americanOdds, point: pick.line.point }, found.line);
        const sendAlert = canAlert && move.significant && !pick.lineAlertedAt;
        tx.update(ref, sendAlert ? { lineNow, lineAlertedAt: checkedAt } : { lineNow });
        updated += 1;
        if (!sendAlert) return null;
        return lineMoveMessage(
          `${pick.pickText} (${formatOdds(pick.americanOdds)})`,
          lineLabel(found.game, pick.line.choice, found.line),
        );
      });
      if (alert) recipients.push({ uid: linkedSnap.id, message: alert });
    }
  }

  if (sender && recipients.length > 0) await notifyUsers(db, sender, 'lineMoves', recipients);
  return { updated, alerted: recipients.length };
}

/**
 * SPEC.md §1.3: as the vault opens, re-prices every linked pick to its latest
 * DraftKings line, including a moved spread or total. Runs right after the
 * vault-opening pull, so `lineNow` is the price at open; if that pull was
 * skipped or failed, it's the last scheduled pull's price. Units and the key
 * decision then use these odds. Each pick is re-priced at most once.
 */
export async function priceWeekAtOpenLogic(
  db: Firestore,
  params: { seasonId: string; weekId: string; nowMs?: number },
): Promise<{ repriced: string[] }> {
  const { seasonId, weekId } = params;
  const pricedAt = Timestamp.fromMillis(params.nowMs ?? Date.now());
  const weekSnap = await weekDoc(db, seasonId, weekId).get();
  if ((weekSnap.data() as Week | undefined)?.status !== 'locked') return { repriced: [] };

  const repriced: string[] = [];
  const picks = await picksCol(db, seasonId, weekId).get();
  for (const doc of picks.docs) {
    const changed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      const pick = snap.data() as PickDoc | undefined;
      // An Admin edit after lock may have replaced it, or grading may have started.
      if (!pick || pick.result !== 'pending') return false;
      const next = priceAtOpen(pick);
      if (!next) return false;
      tx.update(doc.ref, { ...next, pricedAtOpenAt: pricedAt });
      return true;
    });
    if (changed) repriced.push(doc.id);
  }
  return { repriced };
}

/** The sports a week's picks were sealed from, so the lock-time pull only spends credits where it matters. */
export async function linkedSportsForWeek(db: Firestore, seasonId: string, weekId: string): Promise<OddsSport[]> {
  const picks = await picksCol(db, seasonId, weekId).get();
  const sports = new Set<OddsSport>();
  for (const doc of picks.docs) {
    const line = (doc.data() as PickDoc).line;
    if (line) sports.add(line.sport);
  }
  return [...sports].sort();
}
