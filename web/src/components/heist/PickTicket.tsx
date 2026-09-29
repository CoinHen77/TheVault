import { unitsForPick, type Pick as PickDoc, type WeekType } from '@vault/shared';
import { COPY } from '../../lib/copy';
import { formatOdds, formatUnits } from '../../lib/format';
import { ResultStamp, WaxSeal } from './Seals';
import Ticket, { TicketStat } from './Ticket';

type PickFields = Pick<PickDoc, 'pickText' | 'gameText' | 'americanOdds' | 'result' | 'units'>;

/** "Ticket · Wk 06" for regular weeks, "Ticket · Wild Card" etc. for playoffs. */
export function ticketLabel(week: { nflWeek: number | null; type: WeekType }): string {
  if (week.type === 'regular' && week.nflWeek !== null) return `${COPY.ticket} · Wk ${String(week.nflWeek).padStart(2, '0')}`;
  const names: Record<WeekType, string> = {
    regular: 'Regular',
    wildcard: 'Wild Card',
    divisional: 'Divisional',
    conference: 'Conference',
    superbowl: 'Super Bowl',
  };
  return `${COPY.ticket} · ${names[week.type]}`;
}

/**
 * A player's Best Bet as a ticket. `sealed` (before lock) shows the wax seal
 * and what it would win; otherwise the result stamp and units once graded.
 */
export default function PickTicket({
  pick,
  week,
  sealed,
  usedInBook = false,
  subtitleOverride,
  notchClassName,
}: {
  pick: PickFields;
  week: { nflWeek: number | null; type: WeekType };
  sealed: boolean;
  usedInBook?: boolean;
  subtitleOverride?: string;
  notchClassName?: string;
}) {
  const graded = pick.result !== 'pending';
  const units = graded ? (pick.units ?? unitsForPick(pick.americanOdds, pick.result as 'win' | 'loss' | 'push')) : null;
  const winUnits = unitsForPick(pick.americanOdds, 'win');

  return (
    <Ticket
      eyebrow={`${ticketLabel(week)}${usedInBook ? ' · Used in the Book' : ''}`}
      title={pick.pickText}
      subtitle={subtitleOverride ?? pick.gameText}
      muted={graded && pick.result !== 'win'}
      notchClassName={notchClassName}
      mark={sealed ? <WaxSeal /> : graded ? <ResultStamp result={pick.result} /> : undefined}
      footer={
        <div className="flex items-end justify-between gap-3">
          <TicketStat label="Odds" value={formatOdds(pick.americanOdds)} />
          {units !== null ? (
            <TicketStat
              label="Result"
              value={formatUnits(units)}
              tone={units > 0 ? 'good' : units < 0 ? 'bad' : 'default'}
              align="right"
            />
          ) : (
            <TicketStat label="To win" value={formatUnits(winUnits)} tone="good" align="right" />
          )}
        </div>
      }
    />
  );
}
