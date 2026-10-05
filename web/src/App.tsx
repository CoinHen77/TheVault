import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import LockOverlay from './components/heist/LockOverlay';
import Icon from './components/Icon';
import { ADMIN_TAB, ALERTS_TAB, BottomNav, COMMENTS_TAB, RULES_TAB, SideNav, type NavItem, type Tab } from './components/Nav';
import { refreshPushToken } from './lib/push';
import { COPY } from './lib/copy';
import { LockRevealProvider } from './hooks/LockReveal';
import { VaultDataProvider } from './hooks/VaultDataProvider';
import Admin from './screens/Admin';
import Alerts from './screens/Alerts';
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

const TABS: ReadonlySet<string> = new Set<Tab>(['dashboard', 'pick', 'week', 'standings', 'book', 'rules', 'comments', 'alerts', 'admin']);

/** A notification tap opens the app at /?tab=…; read it once, then tidy the URL. */
function initialTab(): Tab {
  const tab = new URLSearchParams(window.location.search).get('tab');
  if (tab) window.history.replaceState(null, '', window.location.pathname);
  return tab && TABS.has(tab) ? (tab as Tab) : 'dashboard';
}

function AppShell() {
  const { user, player, isAdmin, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab);
  const uid = user?.uid ?? null;

  // A notification tapped while the app is already open arrives as a message from the push worker.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; tab?: string } | null;
      if (data?.type === 'vault-open-tab' && data.tab && TABS.has(data.tab)) setTab(data.tab as Tab);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (uid) void refreshPushToken(uid).catch(() => undefined);
  }, [uid]);

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
            className="min-h-11 whitespace-nowrap font-display text-xl font-bold text-vault-gold min-[400px]:text-2xl"
          >
            {COPY.appName}
          </button>
          <div className="flex items-center">
            <HeaderIconButton item={RULES_TAB} active={tab === 'rules'} onClick={() => setTab('rules')} />
            <HeaderIconButton item={COMMENTS_TAB} active={tab === 'comments'} onClick={() => setTab('comments')} />
            <HeaderIconButton item={ALERTS_TAB} active={tab === 'alerts'} onClick={() => setTab('alerts')} />
            {isAdmin && <HeaderIconButton item={ADMIN_TAB} active={tab === 'admin'} onClick={() => setTab('admin')} />}
            <button
              type="button"
              onClick={() => void signOut()}
              title={player?.displayName ? `Signed in as ${player.displayName}` : undefined}
              className="min-h-11 whitespace-nowrap rounded-lg px-1.5 text-xs text-vault-gold-soft/55 transition hover:text-vault-gold-soft/90"
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
          {tab === 'alerts' && <Alerts />}
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
