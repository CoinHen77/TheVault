import { useMemo, useState } from 'react';
import {
  eligibleOddsGames,
  formatSpreadPoint,
  oddsGameText,
  oddsPickText,
  teamCode,
  type OddsChoice,
  type OddsFeed,
  type OddsGame,
} from '@vault/shared';
import { useDocData } from '../hooks/useDocData';
import { COPY } from '../lib/copy';
import { formatOdds, formatTimestampET } from '../lib/format';

export interface OddsBoardSelection {
  gameText: string;
  pickText: string;
  americanOdds: number;
}

/**
 * DraftKings lines for this week's eligible games (kickoff at or after lock),
 * from `odds/feed`. Tapping a line fills the pick form; the form stays
 * editable, so props and lines the board doesn't carry still work. Renders
 * nothing when there's no feed or no eligible games.
 */
export default function OddsBoard({
  lockAtMs,
  disabled,
  onSelect,
}: {
  lockAtMs: number;
  disabled: boolean;
  onSelect: (selection: OddsBoardSelection) => void;
}) {
  const { data: feed } = useDocData<OddsFeed>('odds/feed');
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const games = useMemo(() => {
    if (!feed) return [];
    const withMs = feed.games.map((g) => ({ ...g, commenceMs: g.commenceAt.toMillis() }));
    return eligibleOddsGames(withMs, lockAtMs);
  }, [feed, lockAtMs]);

  if (!feed || games.length === 0) return null;

  function choose(game: OddsGame, choice: OddsChoice) {
    const line = game.lines[choice];
    if (!line) return;
    setSelected(`${game.eventId}:${choice}`);
    onSelect({ gameText: oddsGameText(game), pickText: oddsPickText(game, choice, line), americanOdds: line.odds });
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">{COPY.oddsBoard}</p>
        <p className="text-[11px] text-vault-gold-soft/45">Updated {formatTimestampET(feed.pulledAt)}</p>
      </div>
      <p className="text-xs text-vault-gold-soft/60">{COPY.oddsBoardHint}</p>

      <ul className="flex flex-col gap-1.5">
        {games.map((game) => {
          const open = openId === game.eventId;
          return (
            <li key={game.eventId} className="rounded-lg border border-vault-line bg-vault-black/30">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : game.eventId)}
                aria-expanded={open}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left"
              >
                <span className="font-mono text-sm text-vault-gold-soft">{oddsGameText(game)}</span>
                <span className="flex items-center gap-2 text-xs text-vault-gold-soft/55">
                  {formatTimestampET(game.commenceAt)}
                  <span aria-hidden="true" className={`transition ${open ? 'rotate-90' : ''}`}>
                    ›
                  </span>
                </span>
              </button>

              {open && (
                <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-1.5 border-t border-vault-line px-3 py-2.5">
                  <span />
                  <span className="text-center text-[11px] text-vault-gold-soft/55">{teamCode(game.awayTeam)}</span>
                  <span className="text-center text-[11px] text-vault-gold-soft/55">{teamCode(game.homeTeam)}</span>
                  {ROWS.map(([label, left, right]) => (
                    <Row key={label} label={label}>
                      {[left, right].map((choice) => {
                        const line = game.lines[choice];
                        const key = `${game.eventId}:${choice}`;
                        return (
                          <button
                            key={choice}
                            type="button"
                            disabled={disabled || !line}
                            onClick={() => choose(game, choice)}
                            className={`min-h-11 rounded-md border px-2 font-mono text-xs transition disabled:opacity-35 ${
                              selected === key
                                ? 'border-vault-gold bg-vault-gold/15 text-vault-gold'
                                : 'border-vault-steel-700 text-vault-gold-soft hover:border-vault-gold/60'
                            }`}
                          >
                            {line ? lineLabel(choice, line.point, line.odds) : '—'}
                          </button>
                        );
                      })}
                    </Row>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ROWS: [string, OddsChoice, OddsChoice][] = [
  ['Spread', 'spreadAway', 'spreadHome'],
  ['Money', 'mlAway', 'mlHome'],
  ['Total', 'over', 'under'],
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="pr-1 text-[11px] uppercase tracking-[0.1em] text-vault-gold-soft/55">{label}</span>
      {children}
    </>
  );
}

function lineLabel(choice: OddsChoice, point: number | null, odds: number): string {
  if (choice === 'over') return `O ${point} ${formatOdds(odds)}`;
  if (choice === 'under') return `U ${point} ${formatOdds(odds)}`;
  if (point === null) return formatOdds(odds);
  return `${formatSpreadPoint(point)} ${formatOdds(odds)}`;
}
