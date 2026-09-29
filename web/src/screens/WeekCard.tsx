import { useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import Envelope from '../components/heist/Envelope';
import PickTicket from '../components/heist/PickTicket';
import Icon from '../components/Icon';
import { EmptyState, WeekStatusPill } from '../components/ui';
import { useLockReveal } from '../hooks/LockReveal';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useBookBets, useBuyIns, usePicks } from '../hooks/useWeekData';
import { COPY } from '../lib/copy';
import { weekLabel } from '../lib/format';
import { keyDecisionReason } from '../lib/keyDecision';

/**
 * Week Card (SPEC.md §7 screen 3). Before lock: an envelope per paid player,
 * showing only who has sealed a pick. After lock: every ticket, stamped once
 * graded, plus the week record and who holds the key.
 */
export default function WeekCard() {
  const { user } = useAuth();
  const { season, week, players } = useVaultData();
  const seasonId = season?.id ?? null;
  const weekId = week?.id ?? null;
  const revealed = Boolean(week) && week!.status !== 'open';

  const { data: buyIns } = useBuyIns(seasonId, weekId);
  const { data: allPicks } = usePicks(seasonId, weekId, revealed);
  const { data: bets } = useBookBets(seasonId, weekId, revealed);

  // H4: the first time this device sees the revealed tickets, flip them open
  // one after another (after the door overlay, if it's still playing).
  const { playing, flipWeekId, consumeFlip } = useLockReveal();
  // Cleared when the last ticket finishes flipping, so it runs once per week.
  const flip = revealed && flipWeekId !== null && flipWeekId === weekId && Boolean(allPicks?.length);
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
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-vault-gold">{weekLabel(week)}</h1>
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
          {revealed ? "The door's open. Here's everyone's ticket." : 'Every envelope opens at the same moment the door locks.'}
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
                <PickTicket
                  pick={p}
                  week={week}
                  sealed={false}
                  usedInBook={bookLegIds.has(p.id)}
                  subtitleOverride={`${p.id === user?.uid ? 'You' : nameOf(p.id)}${p.gameText ? ` · ${p.gameText}` : ''}`}
                />
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
