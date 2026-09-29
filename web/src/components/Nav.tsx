import Icon, { type IconName } from './Icon';

export type Tab = 'dashboard' | 'pick' | 'week' | 'standings' | 'book' | 'rules' | 'admin';

/** Rules and Admin live behind header icons so the bottom bar stays at five thumb-sized targets. */
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Home', icon: 'home' },
  { id: 'pick', label: 'Pick', icon: 'target' },
  { id: 'week', label: 'Week', icon: 'calendar' },
  { id: 'standings', label: 'Sharp', icon: 'trophy' },
  { id: 'book', label: 'Book', icon: 'book' },
];

export default function Nav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="sticky bottom-0 border-t border-vault-green-700/40 bg-vault-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={active === tab.id ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 pb-2.5 pt-3 text-[11px] font-medium transition ${
              active === tab.id ? 'text-vault-gold' : 'text-vault-gold-soft/50 hover:text-vault-gold-soft/80'
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
