import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import LockOverlay from './components/heist/LockOverlay';
import Icon from './components/Icon';
import { ADMIN_TAB, BottomNav, COMMENTS_TAB, RULES_TAB, SideNav, type NavItem, type Tab } from './components/Nav';
import { COPY } from './lib/copy';
import { LockRevealProvider } from './hooks/LockReveal';
import { VaultDataProvider } from './hooks/VaultDataProvider';
import Admin from './screens/Admin';
import Book from './screens/Book';
import Comments from './screens/Comments';
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
        <p className="font-display text-2xl text-vault-gold/70">{COPY.appName}</p>
      </main>
    );
  }

  if (status === 'signed-out') {
    return <SignIn />;
  }

  return (
    <VaultDataProvider>
      <LockRevealProvider>
        <AppShell />
      </LockRevealProvider>
    </VaultDataProvider>
  );
}

/** Home, Week and Admin use two columns from 768px; the rest read best as one column. */
const WIDE_TABS: ReadonlySet<Tab> = new Set(['dashboard', 'week', 'admin']);

function AppShell() {
  const { player, isAdmin, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className="flex min-h-full w-full pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <SideNav
        active={tab}
        onChange={setTab}
        showAdmin={isAdmin}
        playerName={player?.displayName ?? null}
        onSignOut={() => void signOut()}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-vault-line bg-vault-black/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setTab('dashboard')}
            className="min-h-11 font-display text-2xl font-bold text-vault-gold"
          >
            {COPY.appName}
          </button>
          <div className="flex items-center">
            <HeaderIconButton item={RULES_TAB} active={tab === 'rules'} onClick={() => setTab('rules')} />
            <HeaderIconButton item={COMMENTS_TAB} active={tab === 'comments'} onClick={() => setTab('comments')} />
            {isAdmin && <HeaderIconButton item={ADMIN_TAB} active={tab === 'admin'} onClick={() => setTab('admin')} />}
            <button
              type="button"
              onClick={() => void signOut()}
              title={player?.displayName ? `Signed in as ${player.displayName}` : undefined}
              className="min-h-11 rounded-lg px-2 text-xs text-vault-gold-soft/55 transition hover:text-vault-gold-soft/90"
            >
              Sign out
            </button>
          </div>
        </header>

        <main
          className={`mx-auto w-full flex-1 px-4 py-5 md:px-8 md:py-8 ${WIDE_TABS.has(tab) ? 'max-w-5xl' : 'max-w-2xl'}`}
        >
          {tab === 'dashboard' && <Dashboard onNavigate={setTab} />}
          {tab === 'pick' && <SubmitPick />}
          {tab === 'week' && <WeekCard />}
          {tab === 'standings' && <Standings />}
          {tab === 'book' && <Book />}
          {tab === 'rules' && <Rules />}
          {tab === 'comments' && <Comments />}
          {tab === 'admin' && isAdmin && <Admin />}
        </main>

        <BottomNav active={tab} onChange={setTab} />
      </div>

      <LockOverlay />
    </div>
  );
}

function HeaderIconButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={item.label}
      title={item.label}
      aria-current={active ? 'page' : undefined}
      className={`flex h-11 w-11 items-center justify-center rounded-lg transition ${
        active ? 'bg-vault-gold/10 text-vault-gold' : 'text-vault-gold-soft/55 hover:text-vault-gold-soft/90'
      }`}
    >
      <Icon name={item.icon} />
    </button>
  );
}
