import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  buildWeeklyReport,
  type BookBet,
  type BuyIn,
  type Pick,
  type Player,
  type Preload,
  type Week,
} from '@vault/shared';
import { ErrorBanner } from '../../components/ui';
import { db } from '../../lib/firebase';
import { formatCents, formatTimestampET, weekLabel, weekTypeLabel } from '../../lib/format';
import { keyDecisionReason } from '../../lib/keyDecision';

type WeekRow = { id: string } & Week;

async function docsOf<T>(path: string): Promise<({ id: string } & T)[]> {
  const snap = await getDocs(collection(db, path));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
}

/** The open vault door as a PNG data URL (react-pdf can't draw WebP), or null if it won't load. */
async function doorPng(): Promise<string | null> {
  try {
    const img = new Image();
    img.src = '/vault/open@2x.webp';
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')?.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/**
 * Control room: the weekly update PDF for a closed week, to share with the
 * crew (group text, email) from the phone's share sheet or as a download.
 * Nothing is stored or sent from the app.
 */
export default function WeeklyUpdate({
  seasonId,
  seasonName,
  weeks,
  players,
}: {
  seasonId: string;
  seasonName: string;
  weeks: WeekRow[];
  players: Record<string, Player>;
}) {
  const closed = weeks.filter((w) => w.status === 'closed').sort((a, b) => b.order - a.order);
  const [weekId, setWeekId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const selected = closed.find((w) => w.id === weekId) ?? closed[0] ?? null;

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  if (!selected) {
    return (
      <p className="text-sm text-vault-gold-soft/60">
        Close a week and its update shows up here, ready to send to the crew.
      </p>
    );
  }

  async function create(week: WeekRow) {
    setBusy(true);
    setError(null);
    setFile(null);
    try {
      const base = `seasons/${seasonId}/weeks`;
      const upTo = weeks.filter((w) => w.status === 'closed' && w.order <= week.order);
      const [history, bets, preloads, render, door] = await Promise.all([
        Promise.all(
          upTo.map(async (w) => ({
            week: w,
            picks: await docsOf<Pick>(`${base}/${w.id}/picks`),
            buyIns: await docsOf<BuyIn>(`${base}/${w.id}/buyIns`),
          })),
        ),
        docsOf<BookBet>(`${base}/${week.id}/bookBets`),
        docsOf<Preload>(`seasons/${seasonId}/preloads`),
        import('../../pdf/WeeklyUpdatePdf'),
        doorPng(),
      ]);

      const names = Object.fromEntries(Object.entries(players).map(([id, p]) => [id, p.displayName]));
      const nextWeek = weeks.find((w) => w.order === week.order + 1) ?? null;
      const report = buildWeeklyReport({
        week,
        picks: history.find((h) => h.week.id === week.id)?.picks ?? [],
        bets,
        history,
        preloads,
        names,
        nextWeek,
      });

      const blob = await render.renderWeeklyUpdatePdf(report, {
        seasonName,
        weekName: weekLabel(week),
        weekTypeLabel: weekTypeLabel(week.type),
        closedAtText: week.closedAt ? formatTimestampET(week.closedAt) : '',
        keyReason: week.bookDecision ? keyDecisionReason(week.bookDecision, players) : '',
        next: nextWeek
          ? { weekName: weekLabel(nextWeek), opensAtText: formatTimestampET(nextWeek.lockAt), buyInText: formatCents(nextWeek.buyInCents) }
          : null,
        generatedText: formatTimestampET({
          seconds: 0,
          nanoseconds: 0,
          toDate: () => new Date(),
          toMillis: () => Date.now(),
        }),
        doorPng: door,
      });

      const name = `The-Vault-${weekLabel(week).replace(/\s+/g, '-')}-Update.pdf`;
      setFile(new File([blob], name, { type: 'application/pdf' }));
      setUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const canShare = Boolean(file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }));

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-vault-gold/40 bg-vault-panel p-4">
      <div>
        <h2 className="font-display text-lg font-bold text-vault-gold">Weekly update</h2>
        <p className="text-xs text-vault-gold-soft/60">
          A PDF recap of a closed week: the Vault, every ticket, the Book, the key and the Sharp race. Share it with the
          crew.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Week"
          value={selected.id}
          onChange={(e) => {
            setWeekId(e.target.value);
            setFile(null);
          }}
          className="min-h-11 flex-1 rounded-lg border border-vault-steel-700 bg-vault-black/40 px-3 text-base text-vault-gold-soft outline-none focus:border-vault-gold/60"
        >
          {closed.map((w) => (
            <option key={w.id} value={w.id}>
              {weekLabel(w)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => void create(selected)}
          className="min-h-11 rounded-lg bg-vault-gold px-4 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
        >
          {busy ? 'Building…' : `Create ${weekLabel(selected)} PDF`}
        </button>
      </div>

      {file && url && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {canShare && (
            <button
              type="button"
              onClick={() => void navigator.share({ files: [file], title: file.name }).catch(() => undefined)}
              className="min-h-11 flex-1 rounded-lg bg-vault-gold px-4 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft"
            >
              Share…
            </button>
          )}
          <a
            href={url}
            download={file.name}
            className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-vault-gold/60 px-4 text-sm font-semibold text-vault-gold transition hover:bg-vault-gold/10"
          >
            Download
          </a>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-vault-line px-4 text-sm text-vault-gold-soft/80 transition hover:border-vault-gold/50"
          >
            Preview
          </a>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
    </section>
  );
}
