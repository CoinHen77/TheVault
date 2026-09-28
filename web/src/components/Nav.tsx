export type Tab = 'dashboard' | 'pick' | 'week' | 'standings' | 'book';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Home' },
  { id: 'pick', label: 'Pick' },
  { id: 'week', label: 'Week' },
  { id: 'standings', label: 'Sharp' },
  { id: 'book', label: 'Book' },
];

export default function Nav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="sticky bottom-0 border-t border-vault-green-700/40 bg-vault-black/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex flex-col items-center gap-1 py-3 text-xs font-medium transition ${
              active === tab.id ? 'text-vault-gold' : 'text-vault-gold-soft/40'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${active === tab.id ? 'bg-vault-gold' : 'bg-transparent'}`}
            />
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
