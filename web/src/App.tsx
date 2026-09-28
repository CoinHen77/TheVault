import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import Nav, { type Tab } from './components/Nav';
import { VaultDataProvider } from './hooks/VaultDataProvider';
import Book from './screens/Book';
import Dashboard from './screens/Dashboard';
import SignIn from './screens/SignIn';
import Standings from './screens/Standings';
import SubmitPick from './screens/SubmitPick';
import WeekCard from './screens/WeekCard';

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <main className="flex min-h-full items-center justify-center">
        <p className="text-sm text-vault-gold-soft/40">Loading…</p>
      </main>
    );
  }

  if (status === 'signed-out') {
    return <SignIn />;
  }

  return (
    <VaultDataProvider>
      <AppShell />
    </VaultDataProvider>
  );
}

function AppShell() {
  const { player, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
      <header className="flex items-center justify-between border-b border-vault-green-700/40 px-5 py-4">
        <h1 className="text-xl font-semibold tracking-tight text-vault-gold">The Vault</h1>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-xs text-vault-gold-soft/40 transition hover:text-vault-gold-soft/70"
        >
          {player?.displayName ?? 'Sign out'} · Sign out
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'pick' && <SubmitPick />}
        {tab === 'week' && <WeekCard />}
        {tab === 'standings' && <Standings />}
        {tab === 'book' && <Book />}
      </div>

      <Nav active={tab} onChange={setTab} />
    </div>
  );
}
