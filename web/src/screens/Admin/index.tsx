import { useEffect, useState } from 'react';
import type { Week } from '@vault/shared';
import { useAuth } from '../../auth/AuthProvider';
import { EmptyState, ToolPanel } from '../../components/ui';
import { useDocData } from '../../hooks/useDocData';
import { useVaultData } from '../../hooks/VaultDataProvider';
import { useBookBets, usePicks, useWeeks } from '../../hooks/useWeekData';
import { COPY } from '../../lib/copy';
import { weekLabel } from '../../lib/format';
import AdminPickEntry from './AdminPickEntry';
import BookBetsGrading from './BookBetsGrading';
import BuyInsPanel from './BuyInsPanel';
import CreateSeason from './CreateSeason';
import DeleteSeason from './DeleteSeason';
import InvitePlayers from './InvitePlayers';
import PreloadPanel from './PreloadPanel';
import OverrideBookholder from './OverrideBookholder';
import PicksGrading from './PicksGrading';
import { CreateNextWeek, WeekEditor, WeekPicker } from './WeekManager';
import WeekLifecycleActions from './WeekLifecycleActions';

/**
 * The Control room (SPEC.md §7 screen 8, CLAUDE.md H5). Weekly work up top:
 * the progress bar with the next action, buy-ins and pick entry beside
 * grading. Setup tools that come up rarely (invites, preload, week edits, key
 * override, new week, delete season) sit in collapsible panels below.
 */
export default function Admin() {
  const { isAdmin } = useAuth();
  const { season, players } = useVaultData();
  const { data: weeks } = useWeeks(season?.id ?? null);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);

  useEffect(() => {
    if (season && !selectedWeekId) setSelectedWeekId(season.currentWeekId);
  }, [season, selectedWeekId]);

  const weekPath = season && selectedWeekId ? `seasons/${season.id}/weeks/${selectedWeekId}` : null;
  const { data: week } = useDocData<Week>(weekPath);

  // Admin always passes the picks rule (isAdmin() bypass, SPEC.md §6); bookBets has no such
  // bypass and the collection is empty anyway while `open`, so gate the same way Book.tsx does.
  const { data: picks } = usePicks(season?.id ?? null, week?.id ?? null, Boolean(week));
  const { data: bets } = useBookBets(season?.id ?? null, week?.id ?? null, Boolean(week) && week!.status !== 'open');

  if (!isAdmin) {
    return <EmptyState>Admin only.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-vault-gold">{COPY.admin}</h1>
          <p className="text-sm text-vault-gold-soft/60">{season ? season.name : 'No active season'}</p>
        </div>
        {season && (
          <div className="md:w-72">
            <WeekPicker
              weeks={weeks}
              selectedWeekId={selectedWeekId}
              currentWeekId={season.currentWeekId}
              onChange={setSelectedWeekId}
            />
          </div>
        )}
      </header>

      {!season ? (
        <>
          <CreateSeason />
          <ToolPanel title="Invite players" hint="Only invited emails can sign in">
            <InvitePlayers />
          </ToolPanel>
        </>
      ) : (
        <>
          {week && (
            <>
              <WeekLifecycleActions seasonId={season.id} week={week} picks={picks} bets={bets} players={players} />

              {/* From 768px: buy-ins and pick entry on the left, grading on the right (once there's grading to do). */}
              <div className={`grid gap-4 md:items-start md:gap-6 ${week.status === 'open' ? '' : 'md:grid-cols-2'}`}>
                <div className="flex min-w-0 flex-col gap-4">
                  <BuyInsPanel seasonId={season.id} week={week} players={players} />
                  <AdminPickEntry seasonId={season.id} week={week} players={players} picks={picks} />
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                  <PicksGrading seasonId={season.id} week={week} players={players} picks={picks} />
                  <BookBetsGrading seasonId={season.id} week={week} bets={bets} picks={picks} players={players} />
                </div>
              </div>
            </>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">
              Setup and tools
            </h2>
            <ToolPanel title="Invite players" hint="Only invited emails can sign in">
              <InvitePlayers />
            </ToolPanel>
            <ToolPanel title="Preload" hint="One-time deposit before weekly buy-ins">
              <PreloadPanel seasonId={season.id} requiredPreloadCents={season.requiredPreloadCents} players={players} />
            </ToolPanel>
            {week && (
              <>
                <ToolPanel title={`Edit ${weekLabel(week)}`} hint="Buy-in and lock time">
                  <WeekEditor seasonId={season.id} week={week} />
                </ToolPanel>
                <ToolPanel title={`Override the ${COPY.bookholder}`} hint="Hand the key to someone else; it's logged">
                  <OverrideBookholder seasonId={season.id} week={week} players={players} />
                </ToolPanel>
              </>
            )}
            <ToolPanel title="Create a week" hint="Closing a week normally creates the next one">
              <CreateNextWeek
                seasonId={season.id}
                weeks={weeks}
                players={players}
                buyInDefaults={season.buyInDefaultsCents}
              />
            </ToolPanel>
            <ToolPanel title="Delete season" hint="Permanent. Removes everything in this season">
              <DeleteSeason seasonId={season.id} />
            </ToolPanel>
          </section>
        </>
      )}
    </div>
  );
}
