import { COPY } from '../lib/copy';
import Door from './heist/Door';
import Icon, { type IconName } from './Icon';

export type Tab = 'dashboard' | 'pick' | 'week' | 'standings' | 'book' | 'rules' | 'admin';

export interface NavItem {
  id: Tab;
  label: string;
  icon: IconName;
}

/** The five everyday screens: the phone bottom bar and the top of the side menu. */
export const MAIN_TABS: NavItem[] = [
  { id: 'dashboard', label: 'Home', icon: 'home' },
  { id: 'pick', label: 'Pick', icon: 'target' },
  { id: 'week', label: 'Week', icon: 'calendar' },
  { id: 'standings', label: 'Sharp', icon: 'trophy' },
  { id: 'book', label: 'Book', icon: 'book' },
];

/** Rules and Admin: header icons on phones, the lower side-menu group from 768px up. */
export const RULES_TAB: NavItem = { id: 'rules', label: COPY.rules, icon: 'rules' };
export const ADMIN_TAB: NavItem = { id: 'admin', label: COPY.admin, icon: 'gear' };

/** Phone (<768px) bottom bar: five thumb-sized targets above the home-indicator inset. */
export function BottomNav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-10 border-t border-vault-line bg-vault-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="grid grid-cols-5">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={active === tab.id ? 'page' : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
              active === tab.id ? 'text-vault-gold' : 'text-vault-gold-soft/55 hover:text-vault-gold-soft/85'
            }`}
          >
            <Icon name={tab.icon} />
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

/**
 * Left menu from 768px: brand, the five screens, then The Code and Control room.
 * Tablets (768–1023px) get an 80px icon strip so two content columns still fit;
 * from 1024px it widens to the full labelled menu.
 */
export function SideNav({
  active,
  onChange,
  showAdmin,
  playerName,
  onSignOut,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
  showAdmin: boolean;
  playerName: string | null;
  onSignOut: () => void;
}) {
  const secondary = showAdmin ? [RULES_TAB, ADMIN_TAB] : [RULES_TAB];
  return (
    <aside className="sticky top-0 hidden h-dvh w-20 shrink-0 flex-col border-r border-vault-line bg-vault-black px-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] md:flex lg:w-60 lg:px-4">
      <button
        type="button"
        onClick={() => onChange('dashboard')}
        aria-label={`${COPY.appName} home`}
        className="flex min-h-11 items-center justify-center gap-3 rounded-xl py-1 lg:justify-start lg:px-2"
      >
        <Door state="closed" height={44} decorative />
        <span className="hidden font-display text-2xl font-bold text-vault-gold lg:inline">{COPY.appName}</span>
      </button>

      <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
        {MAIN_TABS.map((item) => (
          <SideNavButton key={item.id} item={item} active={active === item.id} onClick={() => onChange(item.id)} />
        ))}
        <div className="my-3 border-t border-vault-line" />
        {secondary.map((item) => (
          <SideNavButton key={item.id} item={item} active={active === item.id} onClick={() => onChange(item.id)} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-vault-line pt-4">
        {playerName && <p className="hidden truncate px-3 text-sm text-vault-gold-soft/80 lg:block">{playerName}</p>}
        <button
          type="button"
          onClick={onSignOut}
          title={playerName ? `Signed in as ${playerName}` : undefined}
          className="min-h-11 rounded-lg px-1 text-center text-xs lg:px-3 lg:text-left lg:text-sm text-vault-gold-soft/55 transition hover:bg-vault-panel hover:text-vault-gold-soft/90"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function SideNavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center text-[11px] font-medium leading-tight transition lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-left lg:text-sm ${
        active ? 'bg-vault-gold/10 text-vault-gold' : 'text-vault-gold-soft/65 hover:bg-vault-panel hover:text-vault-gold-soft'
      }`}
    >
      <Icon name={item.icon} />
      {item.label}
    </button>
  );
}
