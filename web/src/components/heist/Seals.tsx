import type { PickResult } from '@vault/shared';

/** Red wax seal with a "V" — marks a pick as sealed until lock. */
export function WaxSeal({
  size = 38,
  className = '',
  decorative = false,
}: {
  size?: number;
  className?: string;
  /** True when surrounding text already says "seal" (e.g. inside the Seal it button). */
  decorative?: boolean;
}) {
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'Sealed' };
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} {...a11y}>
      <path
        d="M20 3c3 0 4 2 6.5 2.5S32 5 33.5 7.5 35 12 36 14.5s1.5 4 1 6.5-2 3.5-2.5 6-1 4.5-3.5 6-4.5 1-7 2S20 37 20 37s-1.5-1-4-1.5-5-.5-7-2-2.5-4-3.5-6S3 24 3 21s1-4 1.5-6.5S5 9 7 7.5s4-1.5 6.5-2.5S17 3 20 3z"
        className="fill-vault-wax"
      />
      <circle cx="20" cy="20" r="11" fill="none" className="stroke-vault-wax-soft" strokeWidth="1.5" />
      <text x="20" y="24.5" textAnchor="middle" fontFamily="'Playfair Display', Georgia, serif" fontSize="12" fill="#f0c9b8">
        V
      </text>
    </svg>
  );
}

const STAMP_TEXT: Record<Exclude<PickResult, 'pending'>, string> = { win: 'WIN', loss: 'LOSS', push: 'PUSH' };
const STAMP_CLASS: Record<Exclude<PickResult, 'pending'>, string> = {
  win: 'border-vault-win text-vault-win',
  loss: 'border-vault-loss text-vault-loss',
  push: 'border-vault-push text-vault-push',
};

/** Rubber-stamp result mark. Renders nothing for pending picks. */
export function ResultStamp({ result, size = 'md' }: { result: PickResult; size?: 'sm' | 'md' }) {
  if (result === 'pending') return null;
  const sizeClass = size === 'sm' ? 'px-1.5 text-[11px] border-[1.5px]' : 'px-2 py-px text-[15px] border-2';
  return (
    <span
      className={`inline-block -rotate-[10deg] rounded font-mono font-medium tracking-wide ${sizeClass} ${STAMP_CLASS[result]}`}
    >
      {STAMP_TEXT[result]}
    </span>
  );
}
