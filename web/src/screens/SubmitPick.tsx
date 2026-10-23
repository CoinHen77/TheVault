import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import {
  ODDS_FEED_DOC_IDS,
  findPickLine,
  isValidAmericanOdds,
  lineMove,
  oddsPickText,
  unitsForPick,
  type OddsFeed,
  type Pick,
  type PickLine,
} from '@vault/shared';
import { useAuth } from '../auth/AuthProvider';
import Countdown from '../components/Countdown';
import OddsBoard from '../components/OddsBoard';
import PickTicket, { ticketLabel } from '../components/heist/PickTicket';
import { WaxSeal } from '../components/heist/Seals';
import Ticket, { TicketStat } from '../components/heist/Ticket';
import { EmptyState, ErrorBanner } from '../components/ui';
import { useDocData } from '../hooks/useDocData';
import { useVaultData } from '../hooks/VaultDataProvider';
import { useMyBuyIn, useMyPick } from '../hooks/useWeekData';
import { functions } from '../lib/firebase';
import { COPY } from '../lib/copy';
import { formatCents, formatOdds, formatTimestampET, formatUnits, parseOddsInput, weekLabel } from '../lib/format';

const submitPick = httpsCallable<
  { seasonId: string; weekId: string; pickText: string; gameText: string; americanOdds: number; line?: PickLine },
  void
>(functions, 'submitPick');

export default function SubmitPick() {
  const { user } = useAuth();
  const { season, week } = useVaultData();
  const { data: buyIn } = useMyBuyIn(season?.id ?? null, week?.id ?? null, user?.uid ?? null);
  const { data: pick } = useMyPick(season?.id ?? null, week?.id ?? null, user?.uid ?? null);

  const [gameText, setGameText] = useState('');
  const [pickText, setPickText] = useState('');
  const [oddsInput, setOddsInput] = useState('');
  /** The board line the form was filled from; dropped if the game or pick is retyped. */
  const [line, setLine] = useState<PickLine | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!pick) return;
    setGameText(pick.gameText);
    setPickText(pick.pickText);
    setOddsInput(String(pick.americanOdds));
    setLine(pick.line ?? null);
  }, [pick]);

  if (!season || !week) {
    return <EmptyState>No active season yet.</EmptyState>;
  }

  const now = Date.now();
  const disabledReason =
    week.status !== 'open'
      ? `${COPY.vaultOpen}. Picks for ${weekLabel(week)} are final.`
      : now >= week.lockAt.toMillis()
        ? 'The vault just opened. Picks are final.'
        : week.resealedAt && pick
          ? 'Your pick was sealed before the vault reopened, so it is final.'
          : !buyIn?.paid
          ? `Your ${formatCents(week.buyInCents)} buy-in isn't marked paid yet. Once the Admin marks it, you can seal a pick.`
          : null;

  const odds = parseOddsInput(oddsInput);
  const oddsValid = oddsInput.trim() !== '' && isValidAmericanOdds(odds);
  const impliedUnits = oddsValid ? unitsForPick(odds, 'win') : null;

  const canSubmit = !disabledReason && gameText.trim() && pickText.trim() && oddsValid && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!season || !week || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await submitPick({
        seasonId: season.id,
        weekId: week.id,
        gameText: gameText.trim(),
        pickText: pickText.trim(),
        americanOdds: odds,
        ...(line ? { line } : {}),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  // After a reseal for late picks, a pick already in shows as a final ticket.
  const locked = week.status !== 'open' || Boolean(week.resealedAt && pick);
  const previewWinUnits = impliedUnits;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-vault-gold">{COPY.pickTitle}</h1>
          <p className="text-sm text-vault-gold-soft/60">{weekLabel(week)}</p>
        </div>
        {!locked && (
          <p className="text-right text-xs text-vault-gold-soft/60">
            {COPY.opensIn}
            <br />
            <span className="font-mono text-sm text-vault-gold">
              <Countdown lockAt={week.lockAt} />
            </span>
          </p>
        )}
      </header>

      {locked && pick ? (
        <div className="flex flex-col gap-3">
          <PickTicket pick={pick} week={week} sealed={week.status === 'open'} />
          <p className="text-center text-xs text-vault-gold-soft/60">
            {week.status === 'open'
              ? 'The vault is resealed for late picks only. Your ticket is final.'
              : `${COPY.vaultOpen}. Your ticket can't change now.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 md:items-start">
          <form className="flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
            <p className="text-xs text-vault-gold-soft/60">
              One Best Bet per week. The vault opens {formatTimestampET(week.lockAt)}; only games starting after that count
              (honor system). Picks from the board are priced at the DraftKings line when the vault opens.
            </p>
            {pick?.line && pick.lineNow && !disabledReason && (
              <LineMoved
                pick={pick}
                line={pick.line}
                onReseal={async (next) => {
                  setError(null);
                  setSuccess(false);
                  try {
                    await submitPick({ seasonId: season.id, weekId: week.id, ...next });
                    setSuccess(true);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  }
                }}
              />
            )}

            {disabledReason && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
                {disabledReason}
              </p>
            )}

            <OddsBoard
              lockAtMs={week.lockAt.toMillis()}
              disabled={Boolean(disabledReason)}
              onSelect={(s) => {
                setGameText(s.gameText);
                setPickText(s.pickText);
                setOddsInput(String(s.americanOdds));
                setLine(s.line);
                setSuccess(false);
              }}
            />

            <Field label="Game">
              <input
                id="pick-game"
                value={gameText}
                onChange={(e) => {
                  setGameText(e.target.value);
                  setLine(null);
                }}
                placeholder="CHI vs CAR"
                disabled={Boolean(disabledReason)}
                className={inputClass}
              />
            </Field>

            <Field label="Your pick">
              <input
                id="pick-text"
                value={pickText}
                onChange={(e) => {
                  setPickText(e.target.value);
                  setLine(null);
                }}
                placeholder="Bears -2.5"
                disabled={Boolean(disabledReason)}
                className={inputClass}
              />
            </Field>

            <Field label="American odds">
              <input
                id="pick-odds"
                value={oddsInput}
                onChange={(e) => setOddsInput(e.target.value)}
                placeholder="-138"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={Boolean(disabledReason)}
                className={`${inputClass} font-mono`}
              />
              <span className="mt-1 text-xs normal-case tracking-normal text-vault-gold-soft/55">
                Whole number, −100 or lower, or +100 or higher.{' '}
                {oddsInput.trim() !== '' && !oddsValid && <span className="text-vault-loss">Those odds aren't valid.</span>}
              </span>
            </Field>

            {error && <ErrorBanner message={error} />}
            {success && <p className="text-sm text-vault-win">{COPY.sealedNote}</p>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-1 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-vault-gold px-4 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
            >
              <WaxSeal size={20} decorative />
              {submitting ? 'Sealing…' : pick ? COPY.resealPick : COPY.sealPick}
            </button>
            {pick && !disabledReason && (
              <p className="text-center text-xs text-vault-gold-soft/55">You can reseal it until the vault opens.</p>
            )}
          </form>

          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">Preview</p>
            <Ticket
              eyebrow={ticketLabel(week)}
              title={pickText.trim() || <span className="text-vault-gold-soft/35">Your pick</span>}
              subtitle={gameText.trim() || 'Game'}
              mark={pick ? <WaxSeal /> : undefined}
              footer={
                <div className="flex items-end justify-between gap-3">
                  <TicketStat label="Odds" value={oddsValid ? formatOdds(odds) : '—'} />
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-vault-gold-soft/60">If it wins / loses</p>
                    <p className="font-mono text-base">
                      <span className="text-vault-win">{previewWinUnits !== null ? formatUnits(previewWinUnits) : '—'}</span>
                      <span className="text-vault-gold-soft/40"> / </span>
                      <span className="text-vault-loss">{formatUnits(-1)}</span>
                    </p>
                  </div>
                </div>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Shown when the DraftKings line on the sealed pick has moved since sealing
 * (from the latest odds pull). One tap reseals at the current line; the form
 * below still works for keeping it or picking something else.
 */
function LineMoved({
  pick,
  line,
  onReseal,
}: {
  pick: Pick;
  line: PickLine;
  onReseal: (next: { gameText: string; pickText: string; americanOdds: number; line: PickLine }) => Promise<void>;
}) {
  const { data: feed } = useDocData<OddsFeed>(`odds/${ODDS_FEED_DOC_IDS[line.sport]}`);
  const [busy, setBusy] = useState(false);
  const now = pick.lineNow!;
  const move = lineMove({ odds: pick.americanOdds, point: line.point }, now);
  if (move.oddsCents === 0 && !move.pointChanged) return null;

  const current = feed ? findPickLine(feed.games, line) : null;
  const nowText = current ? oddsPickText(current.game, line.choice, current.line) : pick.pickText;
  const nowOdds = current?.line.odds ?? now.odds;

  return (
    <section
      className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm ${
        move.significant ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-vault-line text-vault-gold-soft/75'
      }`}
    >
      <p className="font-semibold">Your line moved</p>
      <p>
        You sealed <span className="font-mono">{pick.pickText} {formatOdds(pick.americanOdds)}</span>. DraftKings has{' '}
        <span className="font-mono">
          {nowText} {formatOdds(nowOdds)}
        </span>{' '}
        as of {formatTimestampET(now.checkedAt)}.
      </p>
      <p className="text-xs opacity-80">
        The line when the vault opens is what counts. Reseal at the new line, pick something else below, or keep it.
      </p>
      {current && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onReseal({
              gameText: pick.gameText,
              pickText: nowText,
              americanOdds: current.line.odds,
              line: { ...line, point: current.line.point },
            });
            setBusy(false);
          }}
          className="min-h-11 rounded-lg border border-vault-gold/60 px-3 text-sm font-semibold text-vault-gold transition hover:bg-vault-gold/10 disabled:opacity-40"
        >
          {busy ? 'Sealing…' : `Reseal at ${nowText} ${formatOdds(current.line.odds)}`}
        </button>
      )}
    </section>
  );
}

const inputClass =
  'min-h-11 rounded-lg border border-vault-steel-700 bg-vault-black/40 px-3 py-2.5 text-base text-vault-gold-soft outline-none placeholder:text-vault-gold-soft/35 focus:border-vault-gold/60 disabled:opacity-40';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.12em] text-vault-gold-soft/60">
      {label}
      {children}
    </label>
  );
}
