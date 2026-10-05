import type { BookBet } from '@vault/shared';
import { formatCents, formatOdds } from '../../lib/format';
import { ResultStamp } from './Seals';
import Ticket, { TicketStat } from './Ticket';

/**
 * One of the key holder's book bets as a ticket: straight or parlay, ticket
 * odds, the legs, the stake, and what it pays (or its net once graded).
 * `legName` turns a leg's pick id (a player uid) into display text.
 */
export default function BetTicket({ bet, legName }: { bet: BookBet; legName: (pickId: string) => string }) {
  return (
    <Ticket
      eyebrow={bet.legPickIds.length === 1 ? 'Straight' : `${bet.legPickIds.length}-leg parlay`}
      title={<span className="font-mono">{formatOdds(bet.ticketOdds)}</span>}
      subtitle={bet.legPickIds.map(legName).join(' · ')}
      muted={bet.result === 'loss' || bet.result === 'push'}
      mark={<ResultStamp result={bet.result} />}
      footer={
        <div className="flex items-end justify-between gap-3">
          <TicketStat label="Stake" value={formatCents(bet.stakeCents)} />
          {bet.netCents !== null ? (
            <TicketStat
              label="Net"
              value={`${bet.netCents > 0 ? '+' : ''}${formatCents(bet.netCents)}`}
              tone={bet.netCents > 0 ? 'good' : bet.netCents < 0 ? 'bad' : 'default'}
              align="right"
            />
          ) : (
            <TicketStat label="Pays" value={bet.payoutCents !== null ? formatCents(bet.payoutCents) : '—'} align="right" />
          )}
        </div>
      }
    />
  );
}
