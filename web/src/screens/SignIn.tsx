import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
} from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth, usingEmulators } from '../lib/firebase';

const EMAIL_STORAGE_KEY = 'vault:emailForSignIn';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [needsEmailToComplete, setNeedsEmailToComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    const storedEmail = window.localStorage.getItem(EMAIL_STORAGE_KEY);
    if (storedEmail) {
      void completeEmailLinkSignIn(storedEmail);
    } else {
      setNeedsEmailToComplete(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function completeEmailLinkSignIn(targetEmail: string) {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailLink(auth, targetEmail, window.location.href);
      window.localStorage.removeItem(EMAIL_STORAGE_KEY);
      window.history.replaceState({}, '', window.location.pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: window.location.origin,
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
      setLinkSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (needsEmailToComplete) {
    return (
      <Shell>
        <p className="text-sm text-vault-gold-soft/70">
          Confirm your email to finish signing in.
        </p>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void completeEmailLinkSignIn(email);
          }}
        >
          <EmailInput email={email} onChange={setEmail} />
          <PrimaryButton disabled={busy || !email}>Finish signing in</PrimaryButton>
        </form>
        {error && <ErrorText message={error} />}
      </Shell>
    );
  }

  return (
    <Shell>
      <button
        type="button"
        onClick={() => void handleGoogleSignIn()}
        disabled={busy}
        className="rounded-lg bg-vault-gold px-4 py-3 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-50"
      >
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-vault-gold-soft/40">
        <div className="h-px flex-1 bg-vault-green-700/40" />
        or
        <div className="h-px flex-1 bg-vault-green-700/40" />
      </div>

      {linkSent ? (
        <p className="text-sm text-vault-gold-soft/70">
          Check <span className="font-medium text-vault-gold-soft">{email}</span> for a sign-in link.
          {usingEmulators && (
            <>
              {' '}
              Using the emulators — find the link at{' '}
              <span className="font-mono text-xs">localhost:4000/auth</span>.
            </>
          )}
        </p>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => void handleSendLink(e)}>
          <EmailInput email={email} onChange={setEmail} />
          <button
            type="submit"
            disabled={busy || !email}
            className="rounded-lg border border-vault-green-700/60 px-4 py-3 text-sm font-medium text-vault-gold-soft transition hover:border-vault-gold/60 disabled:opacity-50"
          >
            Email me a sign-in link
          </button>
        </form>
      )}

      {error && <ErrorText message={error} />}

      <p className="text-center text-xs leading-relaxed text-vault-gold-soft/40">
        Invite-only. If your email hasn't been invited, sign-in will be rejected.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-vault-gold">The Vault</h1>
        <p className="mt-1 text-sm text-vault-gold-soft/60">Sign in to see this week's action.</p>
      </header>
      <div className="flex flex-col gap-4 rounded-xl border border-vault-green-700/40 bg-vault-green-900/60 p-5">
        {children}
      </div>
    </main>
  );
}

function EmailInput({ email, onChange }: { email: string; onChange: (v: string) => void }) {
  return (
    <input
      type="email"
      required
      placeholder="you@example.com"
      value={email}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-vault-green-700/60 bg-vault-black/40 px-3 py-3 text-sm text-vault-gold-soft outline-none placeholder:text-vault-gold-soft/30 focus:border-vault-gold/60"
    />
  );
}

function PrimaryButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded-lg bg-vault-gold px-4 py-3 text-sm font-semibold text-vault-black transition hover:bg-vault-gold-soft disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ErrorText({ message }: { message: string }) {
  return <p className="text-sm text-red-400">{message}</p>;
}
