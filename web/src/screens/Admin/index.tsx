import { useEffect, useState } from 'react';
import type { Week } from '@vault/shared';
import { useAuth } from '../../auth/AuthProvider';
import { EmptyState } from '../../components/ui';
import { useDocData } from '../../hooks/useDocData';
import { useVaultData } from '../../hooks/VaultDataProvider';
import { useBookBets, usePicks, useWeeks } from '../../hooks/useWeekData';
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
 * SPEC.md §7 screen 8 / CLAUDE.md Milestone 6: invite, season/week setup,
 * buy-ins, pick entry, grading, close, and Bookholder override — all in one
 * scrolling admin screen (this group is under 20 users; no need for sub-nav).
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
    <div className="flex flex-col gap-4">
      <InvitePlayers />

      {!season ? (
        <CreateSeason />
      ) : (
        <>
          <PreloadPanel seasonId={season.id} requiredPreloadCents={season.requiredPreloadCents} players={players} />

          <WeekPicker
            weeks={weeks}
            selectedWeekId={selectedWeekId}
            currentWeekId={season.currentWeekId}
            onChange={setSelectedWeekId}
          />

          {week && (
            <>
              <WeekEditor seasonId={season.id} week={week} />
              {/* From 768px: buy-ins and pick entry on the left, grading and close on the right. */}
              <div className="grid gap-4 md:grid-cols-2 md:items-start md:gap-6">
                <div className="flex min-w-0 flex-col gap-4">
                  <BuyInsPanel seasonId={season.id} week={week} players={players} />
                  <AdminPickEntry seasonId={season.id} week={week} players={players} picks={picks} />
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                  <PicksGrading seasonId={season.id} week={week} players={players} picks={picks} />
                  <BookBetsGrading seasonId={season.id} week={week} bets={bets} picks={picks} players={players} />
                  <WeekLifecycleActions seasonId={season.id} week={week} picks={picks} bets={bets} players={players} />
                  <OverrideBookholder seasonId={season.id} week={week} players={players} />
                </div>
              </div>
            </>
          )}

          <CreateNextWeek
            seasonId={season.id}
            weeks={weeks}
            players={players}
            buyInDefaults={season.buyInDefaultsCents}
          />

          <DeleteSeason seasonId={season.id} />
        </>
      )}
    </div>
  );
}
