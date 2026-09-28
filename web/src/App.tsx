import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { SHARED_VERSION } from '@vault/shared';
import { functions, usingEmulators } from './lib/firebase';

type PingResult = {
  ok: boolean;
  sharedVersion: string;
  uid: string | null;
  serverTime: string;
};

type Status =
  | { state: 'checking' }
  | { state: 'ok'; result: PingResult }
  | { state: 'error'; message: string };

export default function App() {
  const [status, setStatus] = useState<Status>({ state: 'checking' });

  useEffect(() => {
    const ping = httpsCallable<undefined, PingResult>(functions, 'ping');
    ping()
      .then((res) => setStatus({ state: 'ok', result: res.data }))
      .catch((err: unknown) =>
        setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
  }, []);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 px-5 py-10">
      <header className="border-b border-vault-green-700/40 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-vault-gold">The Vault</h1>
        <p className="mt-1 text-sm text-vault-gold-soft/60">
          Weekly NFL Best Bet pool &middot; ledger and scoreboard only
        </p>
      </header>

      <section className="rounded-xl border border-vault-green-700/40 bg-vault-green-900/60 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-vault-gold-soft/50">
          Milestone 1 &mdash; scaffold
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="@vault/shared" value={SHARED_VERSION} />
          <Row label="Emulators" value={usingEmulators ? 'connected' : 'live project'} />
          <Row
            label="ping()"
            value={
              status.state === 'checking'
                ? 'calling…'
                : status.state === 'ok'
                  ? `ok · shared ${status.result.sharedVersion}`
                  : `failed · ${status.message}`
            }
            tone={status.state === 'error' ? 'bad' : status.state === 'ok' ? 'good' : 'muted'}
          />
          {status.state === 'ok' && <Row label="Server time" value={status.result.serverTime} />}
        </dl>
      </section>

      <p className="text-xs leading-relaxed text-vault-gold-soft/40">
        Placeholder page. Player screens land in Milestone 5; admin screens in Milestone 6.
      </p>
    </main>
  );
}

function Row({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'muted';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-400'
      : tone === 'bad'
        ? 'text-red-400'
        : 'text-vault-gold-soft/80';
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-vault-gold-soft/50">{label}</dt>
      <dd className={`text-right font-mono text-xs ${toneClass}`}>{value}</dd>
    </div>
  );
}
