import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import Icon, { type IconName } from './components/Icon';
import Nav, { type Tab } from './components/Nav';
import { VaultDataProvider } from './hooks/VaultDataProvider';
import Admin from './screens/Admin';
import Book from './screens/Book';
import Dashboard from './screens/Dashboard';
import Rules from './screens/Rules';
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
        <p className="font-display text-2xl text-vault-gold/70">The Vault</p>
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
  const { player, isAdmin, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-vault-green-700/40 px-5 py-3">
        <button type="button" onClick={() => setTab('dashboard')} className="font-display text-2xl font-bold text-vault-gold">
          The Vault
        </button>
        <div className="flex items-center gap-1">
          <HeaderIconButton icon="rules" label="Rules" active={tab === 'rules'} onClick={() => setTab('rules')} />
          {isAdmin && (
            <HeaderIconButton icon="gear" label="Admin" active={tab === 'admin'} onClick={() => setTab('admin')} />
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            title={player?.displayName ? `Signed in as ${player.displayName}` : undefined}
            className="ml-1 rounded-lg px-2 py-1.5 text-xs text-vault-gold-soft/55 transition hover:text-vault-gold-soft/90"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {tab === 'dashboard' && <Dashboard onNavigate={setTab} />}
        {tab === 'pick' && <SubmitPick />}
        {tab === 'week' && <WeekCard />}
        {tab === 'standings' && <Standings />}
        {tab === 'book' && <Book />}
        {tab === 'rules' && <Rules />}
        {tab === 'admin' && isAdmin && <Admin />}
      </div>

      <Nav active={tab} onChange={setTab} />
    </div>
  );
}

function HeaderIconButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={`rounded-lg p-2 transition ${
        active ? 'bg-vault-gold/10 text-vault-gold' : 'text-vault-gold-soft/55 hover:text-vault-gold-soft/90'
      }`}
    >
      <Icon name={icon} />
    </button>
  );
}
