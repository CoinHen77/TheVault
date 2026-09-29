import type { Player, Week } from '@vault/shared';
import { useAuth } from '../auth/AuthProvider';
import Countdown from '../components/Countdown';
import DoorDial, { lockProgress } from '../components/heist/DoorDial';
import KeyBadge from '../components/heist/KeyBadge';
import PickTicket from '../components/heist/PickTicket';
import Icon from '../components/Icon';
import type { Tab } from '../components/Nav';
import { EmptyState, WeekStatusPill } from '../components/ui';
import { useNow } from '../hooks/useNow';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useBookBets, useBuyIns, useMyBuyIn, useMyPick, useStandings, useWeeks } from '../hooks/useWeekData';
import { COPY } from '../lib/copy';
import { formatCents, formatSharePrice, formatShares, formatUnits, weekLabel } from '../lib/format';
import { keyDecisionReason } from '../lib/keyDecision';

/**
 * Home (SPEC.md §7 screen 1), in three states:
 * - open: the closed door in the countdown ring, your sealed ticket, envelopes in, key holder;
 * - locked / grading: the open door, your ticket revealed and stamped once graded;
 * - after a close: the new open week, plus a card for the week that just closed.
 */
export default function Dashboard({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { user } = useAuth();
  const { season, week, players } = useVaultData();
  const uid = user?.uid ?? null;
  const seasonId = season?.id ?? null;
  const weekId = week?.id ?? null;
  const isOpen = week?.status === 'open';

  const { data: buyIn } = useMyBuyIn(seasonId, weekId, uid);
  const { data: pick } = useMyPick(seasonId, weekId, uid);
  const { data: buyIns } = useBuyIns(seasonId, weekId);
  const { data: bets } = useBookBets(seasonId, weekId, Boolean(week) && !isOpen);
  const { data: standings } = useStandings(seasonId);
  const { data: weeks } = useWeeks(seasonId);
  const lastClosed = weeks?.filter((w) => w.status === 'closed' && w.id !== weekId).at(-1) ?? null;
  const { data: lastPick } = useMyPick(seasonId, lastClosed?.id ?? null, uid);
  const { data: lastBets } = useBookBets(seasonId, lastClosed?.id ?? null, Boolean(lastClosed));
  const now = useNow();

  if (!season || !week) {
    return <EmptyState>No active season yet. Check back once the Admin sets one up.</EmptyState>;
  }

  const myIndex = standings?.findIndex((s) => s.id === uid) ?? -1;
  const myStanding = myIndex >= 0 ? standings![myIndex]! : null;
  const myShares = myStanding?.shares ?? 0;
  const myValueCents = Math.round(myShares * season.sharePrice * 100);
  const myPreloadedCents = myStanding?.preloadedCents ?? 0;
  const preloadMet = myPreloadedCents >= season.requiredPreloadCents;

  const paidCount = (buyIns ?? []).filter((b) => b.paid).length;
  const sealedCount = week.submittedPlayerIds.length;
  const usedInBook = Boolean(uid && bets?.some((b) => b.legPickIds.includes(uid)));
  const needsPick = isOpen && Boolean(buyIn?.paid) && !pick;
  const keyHolderName = week.bookholderId === uid ? 'You' : (players[week.bookholderId]?.displayName ?? week.bookholderId);

  return (
    <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-8">
      <div className="flex flex-col gap-4">
        <section className="flex items-center gap-4 md:flex-col md:items-start md:gap-5">
          <DoorDial progress={lockProgress(week.lockAt.toMillis(), now)} state={isOpen ? 'closed' : 'open'} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-vault-gold-soft">{weekLabel(week)}</h2>
              <WeekStatusPill status={week.status} />
            </div>
            {isOpen ? (
              <p className="mt-1 text-xs text-vault-gold-soft/60">
                {COPY.locksIn}{' '}
                <span className="font-mono text-sm text-vault-gold">
                  <Countdown lockAt={week.lockAt} />
                </span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-vault-gold-soft/60">
                {week.status === 'grading' ? 'The door is open. Grading is underway.' : `${COPY.doorOpen}. Picks are revealed.`}
              </p>
            )}
            <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-vault-gold-soft/60">{COPY.inTheVault}</p>
            <p className="font-mono text-3xl font-medium tracking-tight text-vault-gold">{formatCents(season.vaultCents)}</p>
            <p className="font-mono text-xs text-vault-gold-soft/70">
              {COPY.yourCut} {formatCents(myValueCents)}
            </p>
            <p className="font-mono text-xs text-vault-gold-soft/55">
              {formatShares(myShares)} sh · {formatSharePrice(season.sharePrice)}
            </p>
          </div>
        </section>

        {myStanding && (
          <p className="text-xs text-vault-gold-soft/60">
            Season{' '}
            <span className="font-mono text-vault-gold-soft/90">
              {myStanding.wins}-{myStanding.losses}-{myStanding.pushes}
            </span>{' '}
            ·{' '}
            <span
              className={`font-mono ${myStanding.units > 0 ? 'text-vault-win' : myStanding.units < 0 ? 'text-vault-loss' : 'text-vault-gold-soft/90'}`}
            >
              {formatUnits(myStanding.units)}
            </span>{' '}
            · {ordinal(myIndex + 1)} in the Sharp
          </p>
        )}

        {season.requiredPreloadCents > 0 && (
          <p className={`text-xs ${preloadMet ? 'text-vault-win' : 'text-amber-400'}`}>
            Preload: {formatCents(myPreloadedCents)} of {formatCents(season.requiredPreloadCents)} required
            {!preloadMet && ' — buy-ins are blocked until this is met'}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">{COPY.bestBet}</h2>

        {pick ? (
          <>
            <PickTicket pick={pick} week={week} sealed={isOpen} usedInBook={usedInBook} />
            {isOpen && <p className="text-center text-xs text-vault-gold-soft/55">{COPY.sealedNote}</p>}
          </>
        ) : needsPick ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-vault-gold/50 px-4 py-5 text-center">
            <p className="text-sm text-vault-gold-soft/80">Your ticket is blank. Seal a pick before the door locks.</p>
            <button
              type="button"
              onClick={() => onNavigate('pick')}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-vault-gold px-4 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft"
            >
              {COPY.pickTitle}
              <Icon name="arrowRight" className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-vault-steel-700 px-4 py-4 text-center text-sm text-vault-gold-soft/60">
            {isOpen && !buyIn?.paid ? 'Buy in to fill a ticket this week.' : 'No ticket this week.'}
          </p>
        )}

        {isOpen && (
          <div className="flex items-center justify-between rounded-xl border border-vault-line bg-vault-panel px-3 py-2.5 text-sm">
            <span className="text-vault-gold-soft/60">{COPY.envelopesIn}</span>
            <span className="font-mono">
              <span className="text-vault-gold">{sealedCount}</span>
              <span className="text-vault-gold-soft/40"> / {paidCount}</span>
            </span>
          </div>
        )}
        <KeyBadge name={keyHolderName} variant="row" />
        <div className="flex items-center justify-between rounded-xl border border-vault-line bg-vault-panel px-3 py-2.5 text-sm">
          <span className="text-vault-gold-soft/60">Your buy-in</span>
          <span className={buyIn?.paid ? 'text-vault-win' : 'text-vault-loss'}>
            {buyIn?.paid ? `Paid · ${formatCents(buyIn.amountCents)}` : `Unpaid · ${formatCents(week.buyInCents)}`}
          </span>
        </div>

        {isOpen && lastClosed && (
          <LastWeekCard
            week={lastClosed}
            myPick={lastPick}
            usedInBook={Boolean(uid && lastBets?.some((b) => b.legPickIds.includes(uid)))}
            uid={uid}
            players={players}
          />
        )}
      </div>
    </div>
  );
}

/** The week that just closed: your graded ticket, what the Book did, and who got the key. */
function LastWeekCard({
  week,
  myPick,
  usedInBook,
  uid,
  players,
}: {
  week: Week & { id: string };
  myPick: Parameters<typeof PickTicket>[0]['pick'] | null;
  usedInBook: boolean;
  uid: string | null;
  players: Record<string, Player>;
}) {
  const youGotKey = Boolean(uid) && week.nextBookholderId === uid;
  const keyName = players[week.nextBookholderId]?.displayName ?? week.nextBookholderId;
  const reason = week.bookDecision ? keyDecisionReason(week.bookDecision, players) : null;

  return (
    <section className="mt-2 flex flex-col gap-3 border-t border-vault-line pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">
          Last week · {weekLabel(week)}
        </h2>
        <span className="text-xs text-vault-gold-soft/60">
          Book{' '}
          <span className={`font-mono ${week.bookNetCents > 0 ? 'text-vault-win' : week.bookNetCents < 0 ? 'text-vault-loss' : ''}`}>
            {week.bookNetCents > 0 ? '+' : ''}
            {formatCents(week.bookNetCents)}
          </span>
        </span>
      </div>
      {myPick && <PickTicket pick={myPick} week={week} sealed={false} usedInBook={usedInBook} />}
      {youGotKey ? (
        <div className="rounded-xl border border-vault-gold bg-vault-gold/10 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm text-vault-gold">
            <Icon name="key" className="h-4 w-4" />
            {COPY.earnedKey}
          </p>
          {reason && <p className="mt-0.5 text-xs text-vault-gold-soft/80">{reason} You run the Book this week.</p>}
        </div>
      ) : (
        <p className="text-xs text-vault-gold-soft/60">
          {COPY.keyGoesTo} <span className="text-vault-gold">{keyName}</span>
          {reason && ` · ${reason}`}
        </p>
      )}
    </section>
  );
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
