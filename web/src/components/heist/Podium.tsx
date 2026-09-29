import { formatUnits } from '../../lib/format';
import { Avatar } from '../ui';

export interface PodiumEntry {
  id: string;
  name: string;
  units: number;
}

const PLACES = [
  { step: 'h-14', ring: 'ring-vault-gold', text: 'text-vault-gold', bg: 'bg-vault-gold/10' },
  { step: 'h-10', ring: 'ring-vault-steel-300', text: 'text-vault-steel-300', bg: 'bg-vault-steel-700/40' },
  { step: 'h-7', ring: 'ring-amber-600', text: 'text-amber-500', bg: 'bg-amber-900/25' },
] as const;

/** Top three Sharp standings, drawn 2nd · 1st · 3rd. `entries` is already sorted by rank. */
export default function Podium({ entries, youId }: { entries: PodiumEntry[]; youId?: string }) {
  const top = entries.slice(0, 3);
  if (top.length === 0) return null;
  // Visual order puts 1st in the middle.
  const order = [1, 0, 2].filter((i) => i < top.length);

  return (
    <ol className="flex items-end justify-center gap-2.5 pt-2" aria-label="Top three">
      {order.map((i) => {
        const e = top[i]!;
        const place = PLACES[i]!;
        const name = e.id === youId ? 'You' : e.name;
        return (
          <li key={e.id} className="flex w-[30%] max-w-[110px] flex-col items-center gap-1 text-center">
            <span className={`rounded-full ring-[1.5px] ${place.ring}`}>
              <Avatar name={e.name} />
            </span>
            <span className="w-full truncate text-xs text-vault-gold-soft">{name}</span>
            <span
              className={`font-mono text-xs ${e.units > 0 ? 'text-vault-win' : e.units < 0 ? 'text-vault-loss' : 'text-vault-gold-soft/60'}`}
            >
              {formatUnits(e.units)}
            </span>
            <span
              className={`flex w-full items-start justify-center rounded-t-lg pt-1 font-mono text-base ${place.step} ${place.bg} ${place.text}`}
            >
              {i + 1}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
