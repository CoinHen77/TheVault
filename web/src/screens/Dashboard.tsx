import type { BookBet, Comment, Pick as PickDoc, Player, Week } from '@vault/shared';
import { useAuth } from '../auth/AuthProvider';
import Countdown from '../components/Countdown';
import BetTicket from '../components/heist/BetTicket';
import DoorDial, { lockProgress } from '../components/heist/DoorDial';
import KeyBadge from '../components/heist/KeyBadge';
import PickTicket from '../components/heist/PickTicket';
import { ResultStamp } from '../components/heist/Seals';
import Icon from '../components/Icon';
import type { Tab } from '../components/Nav';
import { EmptyState, WeekStatusPill } from '../components/ui';
import { useComments } from '../hooks/useComments';
import { useNow } from '../hooks/useNow';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useBookBets, useBuyIns, useMyBuyIn, useMyPick, usePicks, useStandings, useWeeks } from '../hooks/useWeekData';
import { COPY } from '../lib/copy';
import {
  formatCents,
  formatCountdown,
  formatOdds,
  formatSharePrice,
  formatShares,
  formatTimestampET,
  formatUnits,
  weekLabel,
} from '../lib/format';
import { keyDecisionReason } from '../lib/keyDecision';

type WithId<T> = T & { id: string };

/**
 * Home (SPEC.md §7 screen 1) — the first thing anyone sees after signing in:
 * - "Your move": the one thing to do next, or what's happening;
 * - the vault, this week's status and your ticket;
 * - before the vault opens: who has sealed a pick and who hasn't (names only);
 * - once it opens: the key holder's Book for this week;
 * - a full recap of the last closed week;
 * - the latest posts from the comment section.
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
  const { data: picks } = usePicks(seasonId, weekId, Boolean(week) && !isOpen);
  const { data: bets } = useBookBets(seasonId, weekId, Boolean(week) && !isOpen);
  const { data: standings } = useStandings(seasonId);
  const { data: weeks } = useWeeks(seasonId);
  const lastClosed = weeks?.filter((w) => w.status === 'closed' && w.id !== weekId).at(-1) ?? null;
  const { data: lastPicks } = usePicks(seasonId, lastClosed?.id ?? null, Boolean(lastClosed));
  const { data: lastBets } = useBookBets(seasonId, lastClosed?.id ?? null, Boolean(lastClosed));
  const { data: comments } = useComments();
  const now = useNow();

  if (!season || !week) {
    return <EmptyState>No active season yet. Check back once the Admin sets one up.</EmptyState>;
  }

  const nameOf = (id: string) => (id === uid ? 'You' : (players[id]?.displayName ?? id));
  const myIndex = standings?.findIndex((s) => s.id === uid) ?? -1;
  const myStanding = myIndex >= 0 ? standings![myIndex]! : null;
  const myShares = myStanding?.shares ?? 0;
  const myValueCents = Math.round(myShares * season.sharePrice * 100);
  const myPreloadedCents = myStanding?.preloadedCents ?? 0;
  const preloadMet = myPreloadedCents >= season.requiredPreloadCents;

  const paidIds = (buyIns ?? []).filter((b) => b.paid).map((b) => b.id);
  const sealedSet = new Set(week.submittedPlayerIds);
  const usedInBook = Boolean(uid && bets?.some((b) => b.legPickIds.includes(uid)));
  const isKeyHolder = week.bookholderId === uid;
  const stakedCents = (bets ?? []).reduce((sum, b) => sum + b.stakeCents, 0);
  const legName = (id: string) => {
    const leg = picks?.find((p) => p.id === id);
    return leg ? `${leg.pickText} (${nameOf(id)})` : nameOf(id);
  };

  const move = yourMove({
    status: week.status,
    msToOpen: week.lockAt.toMillis() - now,
    preloadBlocked: season.requiredPreloadCents > 0 && !preloadMet,
    paid: Boolean(buyIn?.paid),
    buyInCents: week.buyInCents,
    hasPick: Boolean(pick),
    isKeyHolder,
    keyHolderName: nameOf(week.bookholderId),
    capLeftCents: week.bookCapCents - stakedCents,
    capCents: week.bookCapCents,
    betCount: bets?.length ?? 0,
  });

  return (
    <div className="flex flex-col gap-6">
      <YourMove move={move} onNavigate={onNavigate} />

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
                  {COPY.opensIn}{' '}
                  <span className="font-mono text-sm text-vault-gold">
                    <Countdown lockAt={week.lockAt} />
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-xs text-vault-gold-soft/60">
                  {week.status === 'grading'
                    ? `${COPY.vaultOpen}. Grading is underway.`
                    : `${COPY.vaultOpen}. Picks are revealed and the ${COPY.bookholder} is up.`}
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
              · <span className={`font-mono ${unitsTone(myStanding.units)}`}>{formatUnits(myStanding.units)}</span> ·{' '}
              {ordinal(myIndex + 1)} in the Sharp
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
          <SectionTitle>{COPY.bestBet}</SectionTitle>
          {pick ? (
            <>
              <PickTicket pick={pick} week={week} sealed={isOpen} usedInBook={usedInBook} />
              {isOpen && <p className="text-center text-xs text-vault-gold-soft/55">{COPY.sealedNote}</p>}
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-vault-steel-700 px-4 py-4 text-center text-sm text-vault-gold-soft/60">
              {isOpen && !buyIn?.paid ? 'Buy in to fill a ticket this week.' : isOpen ? 'Your ticket is blank.' : 'No ticket this week.'}
            </p>
          )}

          <KeyBadge name={nameOf(week.bookholderId)} variant="row" />
          <div className="flex items-center justify-between rounded-xl border border-vault-line bg-vault-panel px-3 py-2.5 text-sm">
            <span className="text-vault-gold-soft/60">Your buy-in</span>
            <span className={buyIn?.paid ? 'text-vault-win' : 'text-vault-loss'}>
              {buyIn?.paid ? `Paid · ${formatCents(buyIn.amountCents)}` : `Unpaid · ${formatCents(week.buyInCents)}`}
            </span>
          </div>

          {isOpen ? (
            <CrewCheckIn paidIds={paidIds} sealedSet={sealedSet} nameOf={nameOf} />
          ) : (
            <ThisWeeksBook
              bets={bets}
              stakedCents={stakedCents}
              capCents={week.bookCapCents}
              keyHolderName={nameOf(week.bookholderId)}
              legName={legName}
              onNavigate={onNavigate}
            />
          )}
        </div>
      </div>

      {lastClosed && (
        <LastWeekRecap
          week={lastClosed}
          picks={lastPicks}
          bets={lastBets}
          uid={uid}
          players={players}
          nameOf={nameOf}
        />
      )}

      <LatestComments comments={comments} onNavigate={onNavigate} />
    </div>
  );
}

interface Move {
  tone: 'action' | 'key' | 'info';
  text: string;
  cta?: { label: string; tab: Tab };
}

/** The one thing this player should do next, in priority order; otherwise what's happening. */
function yourMove(s: {
  status: Week['status'];
  msToOpen: number;
  preloadBlocked: boolean;
  paid: boolean;
  buyInCents: number;
  hasPick: boolean;
  isKeyHolder: boolean;
  keyHolderName: string;
  capLeftCents: number;
  capCents: number;
  betCount: number;
}): Move {
  const opensIn = formatCountdown(s.msToOpen);
  if (s.status === 'open') {
    if (s.preloadBlocked) return { tone: 'action', text: 'Finish your preload with the Admin so you can buy in this week.' };
    if (!s.paid) {
      return {
        tone: 'action',
        text: `Your ${formatCents(s.buyInCents)} buy-in isn't marked paid yet. Pay the Admin to get a ticket this week.`,
      };
    }
    if (!s.hasPick) {
      return { tone: 'action', text: `Seal your pick. The vault opens in ${opensIn}.`, cta: { label: COPY.pickTitle, tab: 'pick' } };
    }
    return {
      tone: 'info',
      text: `You're sealed. The vault opens in ${opensIn}; you can reseal until then.`,
      cta: { label: 'Edit pick', tab: 'pick' },
    };
  }
  if (s.status === 'locked') {
    if (s.isKeyHolder) {
      if (s.capLeftCents > 0) {
        return {
          tone: 'key',
          text: `${COPY.holdKey}. ${formatCents(s.capLeftCents)} of ${formatCents(s.capCents)} left to place.`,
          cta: { label: 'Build a bet', tab: 'book' },
        };
      }
      return { tone: 'key', text: `${COPY.holdKey}. Your full ${formatCents(s.capCents)} is placed.` };
    }
    return {
      tone: 'info',
      text:
        s.betCount > 0
          ? `${COPY.vaultOpen}. ${s.keyHolderName} has placed ${s.betCount} bet${s.betCount === 1 ? '' : 's'}.`
          : `${COPY.vaultOpen}. ${s.keyHolderName} is building the Book.`,
      cta: { label: 'See the picks', tab: 'week' },
    };
  }
  if (s.status === 'grading') return { tone: 'info', text: 'The games are being graded. Results land here when the week closes.' };
  return { tone: 'info', text: 'This week is closed. The next one opens soon.' };
}

function YourMove({ move, onNavigate }: { move: Move; onNavigate: (tab: Tab) => void }) {
  const toneClass =
    move.tone === 'key'
      ? 'border-vault-gold bg-vault-gold/10'
      : move.tone === 'action'
        ? 'border-amber-400/60 bg-amber-400/10'
        : 'border-vault-line bg-vault-panel';
  return (
    <section
      aria-label="Your move"
      className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${toneClass}`}
    >
      <div className="flex items-start gap-2.5">
        {move.tone === 'key' && <Icon name="key" className="mt-0.5 h-4 w-4 shrink-0 text-vault-gold" />}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">Your move</p>
          <p className="text-sm text-vault-gold-soft">{move.text}</p>
        </div>
      </div>
      {move.cta && (
        <button
          type="button"
          onClick={() => onNavigate(move.cta!.tab)}
          className={`flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${
            move.tone === 'info'
              ? 'border border-vault-steel-700 text-vault-gold-soft hover:border-vault-gold/60'
              : 'bg-vault-gold text-vault-black hover:bg-vault-gold-soft'
          }`}
        >
          {move.cta.label}
          <Icon name="arrowRight" className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}

/** Before the vault opens: who has sealed a pick and who hasn't. Names only; picks stay hidden. */
function CrewCheckIn({
  paidIds,
  sealedSet,
  nameOf,
}: {
  paidIds: string[];
  sealedSet: Set<string>;
  nameOf: (id: string) => string;
}) {
  const byName = (a: string, b: string) => nameOf(a).localeCompare(nameOf(b));
  const sealed = paidIds.filter((id) => sealedSet.has(id)).sort(byName);
  const waiting = paidIds.filter((id) => !sealedSet.has(id)).sort(byName);
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-vault-line bg-vault-panel px-3 py-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-vault-gold-soft/60">{COPY.envelopesIn}</span>
        <span className="font-mono">
          <span className="text-vault-gold">{sealed.length}</span>
          <span className="text-vault-gold-soft/40"> / {paidIds.length}</span>
        </span>
      </div>
      {paidIds.length === 0 ? (
        <p className="text-xs text-vault-gold-soft/55">No one has bought in yet.</p>
      ) : (
        <>
          <p className="text-xs text-vault-gold-soft/80">
            <span className="text-vault-win">Sealed:</span> {sealed.length ? sealed.map(nameOf).join(', ') : 'nobody yet'}
          </p>
          {waiting.length > 0 && (
            <p className="text-xs text-vault-gold-soft/80">
              <span className="text-amber-400">Waiting on:</span> {waiting.map(nameOf).join(', ')}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Once the vault opens: what the key holder has logged this week. */
function ThisWeeksBook({
  bets,
  stakedCents,
  capCents,
  keyHolderName,
  legName,
  onNavigate,
}: {
  bets: WithId<BookBet>[] | null;
  stakedCents: number;
  capCents: number;
  keyHolderName: string;
  legName: (id: string) => string;
  onNavigate: (tab: Tab) => void;
}) {
  return (
    <section className="mt-2 flex flex-col gap-3 border-t border-vault-line pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle>This week&apos;s Book</SectionTitle>
        <span className="font-mono text-xs text-vault-gold-soft/70">
          {formatCents(stakedCents)} / {formatCents(capCents)}
        </span>
      </div>
      {!bets || bets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-vault-steel-700 px-4 py-4 text-center text-sm text-vault-gold-soft/60">
          {keyHolderName === 'You' ? "You haven't" : `${keyHolderName} hasn't`} placed any bets yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {bets.map((bet) => (
            <li key={bet.id}>
              <BetTicket bet={bet} legName={legName} />
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => onNavigate('book')}
        className="self-start text-sm text-vault-gold-soft/70 underline-offset-4 hover:text-vault-gold hover:underline"
      >
        Open the Book
      </button>
    </section>
  );
}

/** The last closed week: crew record, everyone's ticket, the Book, the Vault's move and the key decision. */
function LastWeekRecap({
  week,
  picks,
  bets,
  uid,
  players,
  nameOf,
}: {
  week: WithId<Week>;
  picks: WithId<PickDoc>[] | null;
  bets: WithId<BookBet>[] | null;
  uid: string | null;
  players: Record<string, Player>;
  nameOf: (id: string) => string;
}) {
  const record = (picks ?? []).reduce(
    (acc, p) => {
      if (p.result === 'win') acc.w += 1;
      else if (p.result === 'loss') acc.l += 1;
      else if (p.result === 'push') acc.p += 1;
      return acc;
    },
    { w: 0, l: 0, p: 0 },
  );
  const sorted = [...(picks ?? [])].sort((a, b) => (b.units ?? 0) - (a.units ?? 0) || nameOf(a.id).localeCompare(nameOf(b.id)));
  const priceChange = week.closingSharePrice - week.sharePriceAtOpen;
  const youGotKey = Boolean(uid) && week.nextBookholderId === uid;
  const reason = week.bookDecision ? keyDecisionReason(week.bookDecision, players) : null;
  const legName = (id: string) => {
    const leg = picks?.find((p) => p.id === id);
    return leg ? `${leg.pickText} (${nameOf(id)})` : nameOf(id);
  };

  return (
    <section className="flex flex-col gap-4 border-t border-vault-line pt-5">
      <h2 className="font-display text-xl font-bold text-vault-gold">Last week · {weekLabel(week)}</h2>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RecapStat label="Crew record" value={`${record.w}-${record.l}-${record.p}`} />
        <RecapStat
          label="Book"
          value={`${week.bookNetCents > 0 ? '+' : ''}${formatCents(week.bookNetCents)}`}
          tone={week.bookNetCents > 0 ? 'text-vault-win' : week.bookNetCents < 0 ? 'text-vault-loss' : undefined}
        />
        <RecapStat
          label="Vault"
          value={`${formatCents(week.openingVaultCents)} → ${formatCents(week.closingVaultCents)}`}
        />
        <RecapStat
          label="Share price"
          value={`${formatSharePrice(week.closingSharePrice)} (${priceChange >= 0 ? '+' : '−'}${formatSharePrice(Math.abs(priceChange))})`}
          tone={priceChange > 0 ? 'text-vault-win' : priceChange < 0 ? 'text-vault-loss' : undefined}
        />
      </dl>

      {youGotKey ? (
        <div className="rounded-xl border border-vault-gold bg-vault-gold/10 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm text-vault-gold">
            <Icon name="key" className="h-4 w-4" />
            {COPY.earnedKey}
          </p>
          {reason && <p className="mt-0.5 text-xs text-vault-gold-soft/80">{reason} You run the Book this week.</p>}
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-vault-gold-soft/70">
          <Icon name="key" className="h-4 w-4 text-vault-gold" />
          {COPY.keyGoesTo} <span className="text-vault-gold">{nameOf(week.nextBookholderId)}</span>
          {reason && <span className="text-xs text-vault-gold-soft/60">· {reason}</span>}
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-8">
        <div className="flex flex-col gap-2">
          <SectionTitle>The crew&apos;s tickets</SectionTitle>
          {sorted.length === 0 ? (
            <p className="text-sm text-vault-gold-soft/60">No picks were sealed that week.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-vault-line rounded-xl border border-vault-line bg-vault-panel">
              {sorted.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2.5 ${p.id === uid ? 'bg-vault-gold/5' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs text-vault-gold-soft/60">
                      {nameOf(p.id)}
                      {p.id === week.nextBookholderId && <Icon name="key" className="h-3 w-3 text-vault-gold" />}
                    </p>
                    <p className="truncate text-sm text-vault-gold-soft">
                      {p.pickText} <span className="font-mono text-xs text-vault-gold-soft/60">{formatOdds(p.americanOdds)}</span>
                    </p>
                  </div>
                  <ResultStamp result={p.result} size="sm" />
                  <span className={`w-14 text-right font-mono text-sm ${unitsTone(p.units ?? 0)}`}>
                    {p.units !== null ? formatUnits(p.units) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <SectionTitle>The Book</SectionTitle>
          {!bets || bets.length === 0 ? (
            <p className="text-sm text-vault-gold-soft/60">No bets were placed that week.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {bets.map((bet) => (
                <li key={bet.id}>
                  <BetTicket bet={bet} legName={legName} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/** The newest posts from Kade's Comment Section. */
function LatestComments({
  comments,
  onNavigate,
}: {
  comments: WithId<Comment>[] | null;
  onNavigate: (tab: Tab) => void;
}) {
  const latest = (comments ?? []).slice(0, 2);
  return (
    <section className="flex flex-col gap-3 border-t border-vault-line pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle>{COPY.commentsTitle}</SectionTitle>
        <button
          type="button"
          onClick={() => onNavigate('comments')}
          className="min-h-11 text-sm text-vault-gold-soft/70 underline-offset-4 hover:text-vault-gold hover:underline"
        >
          See all
        </button>
      </div>
      {latest.length === 0 ? (
        <p className="text-sm text-vault-gold-soft/60">{COPY.commentsEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {latest.map((c) => (
            <li key={c.id} className="rounded-xl border border-vault-line bg-vault-panel px-3 py-2.5">
              <p className="text-xs text-vault-gold-soft/60">
                <span className="text-vault-gold-soft">{c.authorName}</span> · {formatTimestampET(c.createdAt)}
              </p>
              <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-sm text-vault-gold-soft/90">{c.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">{children}</h2>;
}

function RecapStat({ label, value, tone }: { label: string; value: string; tone?: string | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-vault-line bg-vault-panel px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-vault-gold-soft/60">{label}</dt>
      <dd className={`font-mono text-sm ${tone ?? 'text-vault-gold-soft'}`}>{value}</dd>
    </div>
  );
}

function unitsTone(units: number): string {
  return units > 0 ? 'text-vault-win' : units < 0 ? 'text-vault-loss' : 'text-vault-gold-soft/90';
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
