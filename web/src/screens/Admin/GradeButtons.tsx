import type { PickResult } from '@vault/shared';

type Grade = Exclude<PickResult, 'pending'>;

const GRADES: { result: Grade; short: string; label: string; on: string }[] = [
  { result: 'win', short: 'W', label: 'Win', on: 'border-vault-win bg-vault-win/15 text-vault-win' },
  { result: 'loss', short: 'L', label: 'Loss', on: 'border-vault-loss bg-vault-loss/15 text-vault-loss' },
  { result: 'push', short: 'P', label: 'Push', on: 'border-vault-push bg-vault-push/15 text-vault-push' },
];

/** One-tap W / L / P for a pick or book bet (CLAUDE.md H5). The current grade is filled in. */
export default function GradeButtons({
  current,
  busy,
  subject,
  onGrade,
}: {
  current: PickResult;
  busy: boolean;
  /** Used in each button's accessible name, e.g. "Win: Chiefs ML". */
  subject: string;
  onGrade: (result: Grade) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1.5" role="group" aria-label={`Grade ${subject}`}>
      {GRADES.map((g) => (
        <button
          key={g.result}
          type="button"
          disabled={busy}
          aria-pressed={current === g.result}
          aria-label={`${g.label}: ${subject}`}
          title={g.label}
          onClick={() => onGrade(g.result)}
          className={`h-11 w-11 rounded-lg border font-mono text-sm font-medium transition disabled:opacity-40 ${
            current === g.result ? g.on : 'border-vault-steel-700 text-vault-gold-soft/70 hover:border-vault-gold/50'
          }`}
        >
          {g.short}
        </button>
      ))}
    </div>
  );
}
