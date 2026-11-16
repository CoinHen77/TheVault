import { useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import Envelope from '../components/heist/Envelope';
import PickTicket from '../components/heist/PickTicket';
import Icon from '../components/Icon';
import { EmptyState, WeekStatusPill } from '../components/ui';
import { useLockReveal } from '../hooks/LockReveal';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useBookBets, useBuyIns, usePicks, useWeeks } from '../hooks/useWeekData';
import { COPY } from '../lib/copy';
import { weekLabel } from '../lib/format';
import { keyDecisionReason } from '../lib/keyDecision';

/**
 * Week Card (SPEC.md §7 screen 3). Before lock: an envelope per paid player,
 * showing only who has sealed a pick. After lock: every ticket, stamped once
 * graded, plus the week record and who holds the key. The arrows step back
 * through earlier weeks; tap a ticket to open that player's page.
 */
export default function WeekCard({ onOpenPlayer }: { onOpenPlayer: (playerId: string) => void }) {
  const { user } = useAuth();
  const { season, week: currentWeek, players } = useVaultData();
  const seasonId = season?.id ?? null;

  // Every week up to this one, oldest first; null shows the current week.
  const { data: allWeeks } = useWeeks(seasonId);
  const navWeeks = (allWeeks ?? []).filter((w) => w.order <= (currentWeek?.order ?? Infinity));
  const [viewId, setViewId] = useState<string | null>(null);
  const week = (viewId ? navWeeks.find((w) => w.id === viewId) : null) ?? currentWeek;
  const isCurrent = Boolean(week && week.id === currentWeek?.id);
  const navIndex = week ? navWeeks.findIndex((w) => w.id === week.id) : -1;
  const prevWeek = navIndex > 0 ? navWeeks[navIndex - 1] : undefined;
  const nextWeek = navIndex >= 0 ? navWeeks[navIndex + 1] : undefined;
  const showWeek = (id: string) => setViewId(id === currentWeek?.id ? null : id);

  const weekId = week?.id ?? null;
  const revealed = Boolean(week) && week!.status !== 'open';

  const { data: buyIns } = useBuyIns(seasonId, weekId);
  const { data: allPicks } = usePicks(seasonId, weekId, revealed);
  const { data: bets } = useBookBets(seasonId, weekId, revealed);

  // H4: the first time this device sees the revealed tickets, flip them open
  // one after another (after the door overlay, if it's still playing).
  const { playing, flipWeekId, consumeFlip } = useLockReveal();
  // Cleared when the last ticket finishes flipping, so it runs once per week.
  const flip = isCurrent && revealed && flipWeekId !== null && flipWeekId === weekId && Boolean(allPicks?.length);
  // Fix the start delay when the flip begins, so it doesn't jump when the overlay ends.
  const flipStartRef = useRef<number | null>(null);
  if (!flip) flipStartRef.current = null;
  else flipStartRef.current ??= playing ? 2800 : 150;

  if (!season || !week) {
    return <EmptyState>No active season yet.</EmptyState>;
  }

  const nameOf = (id: string) => players[id]?.displayName ?? id;
  const byName = (a: string, b: string) => nameOf(a).localeCompare(nameOf(b));

  const paidIds = (buyIns ?? []).filter((b) => b.paid).map((b) => b.id).sort(byName);
  const sealedSet = new Set(week.submittedPlayerIds);
  const sealedCount = paidIds.filter((id) => sealedSet.has(id)).length;
  const sealedPct = paidIds.length ? Math.round((sealedCount / paidIds.length) * 100) : 0;
  const notBoughtIn = Object.keys(players)
    .filter((id) => !paidIds.includes(id))
    .sort(byName);

  const record = (allPicks ?? []).reduce(
    (acc, p) => {
      if (p.result === 'win') acc.w += 1;
      else if (p.result === 'loss') acc.l += 1;
      else if (p.result === 'push') acc.p += 1;
      return acc;
    },
    { w: 0, l: 0, p: 0 },
  );
  const bookLegIds = new Set((bets ?? []).flatMap((b) => b.legPickIds));
  const keyHolder = week.status === 'closed' ? week.nextBookholderId : week.bookholderId;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <WeekArrow
              direction="prev"
              label={prevWeek ? weekLabel(prevWeek) : undefined}
              onClick={prevWeek ? () => showWeek(prevWeek.id) : undefined}
            />
            <h1 className="truncate font-display text-2xl font-bold text-vault-gold">{weekLabel(week)}</h1>
            <WeekArrow
              direction="next"
              label={nextWeek ? weekLabel(nextWeek) : undefined}
              onClick={nextWeek ? () => showWeek(nextWeek.id) : undefined}
            />
            <WeekStatusPill status={week.status} />
          </div>
          {revealed ? (
            <span className="font-mono text-base" aria-label={`Record ${record.w} wins, ${record.l} losses, ${record.p} pushes`}>
              <span className="text-vault-win">{record.w}</span>
              <span className="text-vault-gold-soft/40">-</span>
              <span className="text-vault-loss">{record.l}</span>
              <span className="text-vault-gold-soft/40">-</span>
              <span className="text-vault-push">{record.p}</span>
            </span>
          ) : (
            <span className="text-xs text-vault-gold-soft/60">
              {COPY.envelopesIn}{' '}
              <span className="font-mono text-sm text-vault-gold">
                {sealedCount}/{paidIds.length}
              </span>
            </span>
          )}
        </div>
        {!revealed && (
          <div className="h-1.5 overflow-hidden rounded-full bg-vault-line" aria-hidden="true">
            <div className="h-full rounded-full bg-vault-gold transition-all" style={{ width: `${sealedPct}%` }} />
          </div>
        )}
        <p className="text-sm text-vault-gold-soft/60">
          {!isCurrent
            ? "Here's how everyone's ticket finished."
            : revealed
              ? `${COPY.vaultOpen}. Here's everyone's ticket.`
              : 'Every envelope unseals the moment the vault opens.'}
          {!isCurrent && currentWeek && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => setViewId(null)}
                className="text-vault-gold underline-offset-2 hover:underline"
              >
                Back to {weekLabel(currentWeek)}
              </button>
            </>
          )}
        </p>
      </header>

      {!revealed ? (
        <>
          {paidIds.length === 0 ? (
            <EmptyState>No one has bought in yet.</EmptyState>
          ) : (
            <ul className="grid grid-cols-3 gap-2 md:grid-cols-4" aria-label={COPY.envelopes}>
              {paidIds.map((id) => (
                <li key={id}>
                  <Envelope
                    name={nameOf(id)}
                    sealed={sealedSet.has(id)}
                    isYou={id === user?.uid}
                    isKeyHolder={id === week.bookholderId}
                  />
                </li>
              ))}
            </ul>
          )}
          {notBoughtIn.length > 0 && (
            <p className="text-xs text-vault-gold-soft/55">
              Not bought in: <span className="text-vault-gold-soft/80">{notBoughtIn.map(nameOf).join(', ')}</span>
            </p>
          )}
        </>
      ) : !allPicks ? (
        <EmptyState>Opening the envelopes…</EmptyState>
      ) : allPicks.length === 0 ? (
        <EmptyState>No picks were sealed this week.</EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {allPicks
            .slice()
            .sort((a, b) => byName(a.id, b.id))
            .map((p, i) => (
              <li
                key={p.id}
                className={flip ? 'animate-vault-flip' : undefined}
                style={flip ? { animationDelay: `${(flipStartRef.current ?? 150) + i * 110}ms` } : undefined}
                onAnimationEnd={flip && i === allPicks.length - 1 ? consumeFlip : undefined}
              >
                <button
                  type="button"
                  onClick={() => onOpenPlayer(p.id)}
                  aria-label={`${nameOf(p.id)}: see every ticket`}
                  className="block w-full rounded-xl text-left transition hover:brightness-110"
                >
                  <PickTicket
                    pick={p}
                    week={week}
                    sealed={false}
                    usedInBook={bookLegIds.has(p.id)}
                    subtitleOverride={`${p.id === user?.uid ? 'You' : nameOf(p.id)}${p.gameText ? ` · ${p.gameText}` : ''}`}
                  />
                </button>
              </li>
            ))}
        </ul>
      )}

      <div className="flex flex-col gap-1 rounded-xl border border-vault-brass bg-vault-panel px-3 py-2.5 text-sm">
        <p className="flex items-center justify-between gap-3">
          <span className="text-vault-gold-soft/60">{week.status === 'closed' ? COPY.keyGoesTo : COPY.bookholderTitle}</span>
          <span className="flex items-center gap-1.5 text-vault-gold">
            <Icon name="key" className="h-4 w-4" />
            {keyHolder === user?.uid ? 'You' : nameOf(keyHolder)}
          </span>
        </p>
        {week.status === 'closed' && week.bookDecision && (
          <p className="text-xs text-vault-gold-soft/60">{keyDecisionReason(week.bookDecision, players)}</p>
        )}
      </div>
    </div>
  );
}

/** Steps to the previous or next week; dimmed at either end. */
function WeekArrow({
  direction,
  label,
  onClick,
}: {
  direction: 'prev' | 'next';
  label: string | undefined;
  onClick: (() => void) | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label ? `Show ${label}` : direction === 'prev' ? 'No earlier week' : 'No later week'}
      className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-vault-gold-soft/70 transition hover:text-vault-gold disabled:opacity-20"
    >
      <Icon name="arrowRight" className={`h-5 w-5 ${direction === 'prev' ? 'rotate-180' : ''}`} />
    </button>
  );
}
