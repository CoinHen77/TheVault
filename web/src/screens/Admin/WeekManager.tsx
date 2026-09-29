import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import type { Player, Week, WeekType } from '@vault/shared';
import { Card, ErrorBanner, Field, inputClass, WeekStatusPill } from '../../components/ui';
import { functions } from '../../lib/firebase';
import { formatTimestampET, weekLabel } from '../../lib/format';
import { sortedPlayers } from '../../lib/players';
import { suggestNextWeek, WEEK_TYPE_OPTIONS } from '../../lib/weekDefaults';

const createWeek = httpsCallable<
  {
    seasonId: string;
    weekId: string;
    nflWeek: number | null;
    type: WeekType;
    order: number;
    buyInCents: number;
    lockAtMs: number;
    bookholderId: string;
  },
  { weekId: string }
>(functions, 'createWeek');

const updateWeek = httpsCallable<
  { seasonId: string; weekId: string; nflWeek?: number | null; type?: WeekType; buyInCents?: number; lockAtMs?: number },
  void
>(functions, 'updateWeek');

/** `<input type="datetime-local">` works in the browser's local time; Zach and the group operate in America/New_York. */
function toDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function WeekPicker({
  weeks,
  selectedWeekId,
  currentWeekId,
  onChange,
}: {
  weeks: (Week & { id: string })[] | null;
  selectedWeekId: string | null;
  currentWeekId: string;
  onChange: (weekId: string) => void;
}) {
  return (
    <Field label="Week">
      <select
        id="admin-week"
        value={selectedWeekId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {(weeks ?? []).map((w) => (
          <option key={w.id} value={w.id}>
            {weekLabel(w)} · {w.status}
            {w.id === currentWeekId ? ' · current' : ''}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** SPEC.md §5 updateWeek: only while the week is `open` — see functions/src/logic/season.ts. */
export function WeekEditor({ seasonId, week }: { seasonId: string; week: Week & { id: string } }) {
  const [editing, setEditing] = useState(false);
  const [nflWeekInput, setNflWeekInput] = useState('');
  const [type, setType] = useState<WeekType>(week.type);
  const [buyInInput, setBuyInInput] = useState('');
  const [lockAtInput, setLockAtInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNflWeekInput(week.nflWeek !== null ? String(week.nflWeek) : '');
    setType(week.type);
    setBuyInInput((week.buyInCents / 100).toFixed(2));
    setLockAtInput(toDatetimeLocal(week.lockAt.toMillis()));
    setEditing(false);
  }, [week.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const canEdit = week.status === 'open';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const buyInCents = Math.round(Number.parseFloat(buyInInput) * 100);
      const lockAtMs = new Date(lockAtInput).getTime();
      await updateWeek({
        seasonId,
        weekId: week.id,
        nflWeek: type === 'regular' && nflWeekInput.trim() ? Number.parseInt(nflWeekInput, 10) : null,
        type,
        buyInCents,
        lockAtMs,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title={`${weekLabel(week)} — ${week.id}`}>
      <div className="flex items-center justify-between">
        <WeekStatusPill status={week.status} />
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="min-h-11 px-1 text-xs text-vault-gold-soft/50 underline"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label="Buy-in" value={`$${(week.buyInCents / 100).toFixed(2)}`} />
          <Row label="Locks" value={formatTimestampET(week.lockAt)} />
        </dl>
      ) : (
        <form className="mt-3 flex flex-col gap-3" onSubmit={(e) => void handleSave(e)}>
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as WeekType)} className={inputClass}>
              {WEEK_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          {type === 'regular' && (
            <Field label="NFL week #">
              <input
                value={nflWeekInput}
                onChange={(e) => setNflWeekInput(e.target.value)}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
          )}
          <Field label="Buy-in ($)">
            <input
              value={buyInInput}
              onChange={(e) => setBuyInInput(e.target.value)}
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
          <Field label="Locks at">
            <input
              type="datetime-local"
              value={lockAtInput}
              onChange={(e) => setLockAtInput(e.target.value)}
              className={inputClass}
            />
          </Field>
          {error && <ErrorBanner message={error} />}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-vault-gold px-4 py-3 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
          >
            Save
          </button>
        </form>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-vault-gold-soft/50">{label}</dt>
      <dd className="text-vault-gold-soft/90">{value}</dd>
    </div>
  );
}

/**
 * SPEC.md §4: closeWeek normally creates the next week automatically. This
 * manual form is the fallback/recovery path the Admin screen still needs —
 * e.g. to add a playoff week type out of band, or recover a missing week.
 */
export function CreateNextWeek({
  seasonId,
  weeks,
  players,
  buyInDefaults,
}: {
  seasonId: string;
  weeks: (Week & { id: string })[] | null;
  players: Record<string, Player>;
  buyInDefaults: Record<WeekType, number>;
}) {
  const [open, setOpen] = useState(false);
  const latest = weeks && weeks.length > 0 ? weeks[weeks.length - 1]! : null;
  const suggestion = latest ? suggestNextWeek(latest, buyInDefaults) : null;

  const [weekId, setWeekId] = useState('');
  const [nflWeekInput, setNflWeekInput] = useState('');
  const [type, setType] = useState<WeekType>('regular');
  const [order, setOrder] = useState(0);
  const [buyInInput, setBuyInInput] = useState('');
  const [lockAtInput, setLockAtInput] = useState('');
  const [bookholderId, setBookholderId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (suggestion) {
      setWeekId(suggestion.weekId);
      setNflWeekInput(suggestion.nflWeek !== null ? String(suggestion.nflWeek) : '');
      setType(suggestion.type);
      setOrder(suggestion.order);
      setBuyInInput((suggestion.buyInCents / 100).toFixed(2));
      setLockAtInput(toDatetimeLocal(suggestion.lockAtMs));
    } else {
      setBuyInInput((buyInDefaults.regular / 100).toFixed(2));
    }
    setBookholderId(latest?.bookholderId ?? '');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = weekId.trim() !== '' && bookholderId !== '' && buyInInput.trim() !== '' && lockAtInput !== '' && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await createWeek({
        seasonId,
        weekId: weekId.trim(),
        nflWeek: type === 'regular' && nflWeekInput.trim() ? Number.parseInt(nflWeekInput, 10) : null,
        type,
        order,
        buyInCents: Math.round(Number.parseFloat(buyInInput) * 100),
        lockAtMs: new Date(lockAtInput).getTime(),
        bookholderId,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="Manually create a week">
      <p className="mb-3 text-xs text-vault-gold-soft/60">
        Closing a week normally creates the next one for you. Use this only to add or recover one by hand.
      </p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 text-sm text-vault-gold underline">
          + Create a week
        </button>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
          <Field label="Week ID">
            <input value={weekId} onChange={(e) => setWeekId(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as WeekType)} className={inputClass}>
              {WEEK_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          {type === 'regular' && (
            <Field label="NFL week #">
              <input
                value={nflWeekInput}
                onChange={(e) => setNflWeekInput(e.target.value)}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
          )}
          <Field label="Buy-in ($)">
            <input
              value={buyInInput}
              onChange={(e) => setBuyInInput(e.target.value)}
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
          <Field label="Locks at">
            <input
              type="datetime-local"
              value={lockAtInput}
              onChange={(e) => setLockAtInput(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Bookholder">
            <select value={bookholderId} onChange={(e) => setBookholderId(e.target.value)} className={inputClass}>
              <option value="">Select a player…</option>
              {sortedPlayers(players).map(({ uid, player }) => (
                <option key={uid} value={uid}>
                  {player.displayName}
                </option>
              ))}
            </select>
          </Field>
          {error && <ErrorBanner message={error} />}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-vault-gold px-4 py-3 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-40"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-vault-steel-700 px-4 py-3 text-sm text-vault-gold-soft/70"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
