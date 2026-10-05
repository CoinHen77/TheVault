import { doc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { NOTIFY_KINDS, prefsWithDefaults, type NotificationPrefs, type NotifyKind } from '@vault/shared';
import { useAuth } from '../auth/AuthProvider';
import Icon from '../components/Icon';
import { ErrorBanner } from '../components/ui';
import { useDocData } from '../hooks/useDocData';
import { COPY } from '../lib/copy';
import { db } from '../lib/firebase';
import { disablePush, enablePush, pushAvailability, storedPushToken, type PushAvailability } from '../lib/push';

const KIND_COPY: Record<NotifyKind, { title: string; detail: string }> = {
  reminders: {
    title: 'Seal-your-pick reminders',
    detail: 'The night before the vault opens and an hour out, only if you’ve paid and haven’t sealed a pick.',
  },
  vaultOpen: {
    title: 'The vault is open',
    detail: `When picks are revealed. The ${COPY.bookholder} gets their own nudge to place bets.`,
  },
  bookIn: {
    title: "The Book's in",
    detail: `When the ${COPY.bookholder} has placed this week's bets.`,
  },
  weekResults: {
    title: 'Week results',
    detail: `The crew's record, how the Book did, and who gets the key.`,
  },
};

/**
 * Push notification settings: turn them on for this device, and pick which
 * kinds you get. The switches follow the player to every device; "on for this
 * device" is per device.
 */
export default function Alerts() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { data: prefsDoc } = useDocData<Partial<NotificationPrefs>>(uid ? `notificationPrefs/${uid}` : null);
  const prefs = prefsWithDefaults(prefsDoc);

  const [availability, setAvailability] = useState<PushAvailability | null>(null);
  const [onHere, setOnHere] = useState(() => storedPushToken() !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void pushAvailability().then(setAvailability);
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function toggle(kind: NotifyKind) {
    if (!uid) return;
    void run(() => setDoc(doc(db, 'notificationPrefs', uid), { [kind]: !prefs[kind] }, { merge: true }));
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-bold text-vault-gold">Alerts</h1>
        <p className="text-sm text-vault-gold-soft/60">Push notifications from the vault</p>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-vault-brass bg-vault-panel p-4">
        <div className="flex items-start gap-3">
          <Icon name="bell" className={`mt-0.5 h-5 w-5 shrink-0 ${onHere ? 'text-vault-gold' : 'text-vault-gold-soft/50'}`} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-vault-gold-soft">
              {onHere ? 'On for this device' : 'Off for this device'}
            </p>
            <AvailabilityNote availability={availability} onHere={onHere} />
          </div>
        </div>
        {availability === 'ready' && uid && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (onHere) {
                  await disablePush();
                  setOnHere(false);
                } else {
                  await enablePush(uid);
                  setOnHere(true);
                }
              })
            }
            className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-40 ${
              onHere
                ? 'border border-vault-steel-700 text-vault-gold-soft hover:border-vault-gold/60'
                : 'bg-vault-gold text-vault-black hover:bg-vault-gold-soft'
            }`}
          >
            {busy ? 'One moment…' : onHere ? 'Turn off on this device' : 'Turn on for this device'}
          </button>
        )}
        {error && <ErrorBanner message={error} />}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vault-gold-soft/60">What to send me</h2>
        <p className="text-xs text-vault-gold-soft/55">These apply on every device you’ve turned on.</p>
        <ul className="flex flex-col divide-y divide-vault-line rounded-xl border border-vault-line bg-vault-panel">
          {NOTIFY_KINDS.map((kind) => (
            <li key={kind}>
              <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2.5">
                <span className="flex-1">
                  <span className="block text-sm text-vault-gold-soft">{KIND_COPY[kind].title}</span>
                  <span className="block text-xs text-vault-gold-soft/55">{KIND_COPY[kind].detail}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={prefs[kind]}
                  disabled={busy || !uid}
                  onChange={() => toggle(kind)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="relative h-6 w-11 shrink-0 rounded-full bg-vault-steel-700 transition peer-checked:bg-vault-gold peer-focus-visible:ring-2 peer-focus-visible:ring-vault-gold/60 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-vault-black after:transition peer-checked:after:translate-x-5"
                />
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AvailabilityNote({ availability, onHere }: { availability: PushAvailability | null; onHere: boolean }) {
  const text =
    availability === 'needs-install'
      ? 'On iPhone and iPad, notifications only work in the installed app. Tap Share → Add to Home Screen, open The Vault from your Home Screen, then come back here.'
      : availability === 'unsupported'
        ? "This browser can't receive notifications. Try the installed app, or Chrome, Edge, Firefox or Safari."
        : availability === 'no-key'
          ? "Notifications aren't set up in this version of the app yet."
          : onHere
            ? "You'll get the alerts switched on below."
            : 'Turn them on to get reminders and results on this device.';
  return availability === null ? null : <p className="mt-0.5 text-xs text-vault-gold-soft/60">{text}</p>;
}
