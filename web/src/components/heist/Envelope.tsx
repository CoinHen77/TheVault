import Icon from '../Icon';

/**
 * One player's slot on the Week screen before lock: a wax-sealed envelope once
 * they've submitted, a dashed "?" while they haven't. Never shows the pick.
 */
export default function Envelope({
  name,
  sealed,
  isYou = false,
  isKeyHolder = false,
}: {
  name: string;
  sealed: boolean;
  isYou?: boolean;
  isKeyHolder?: boolean;
}) {
  const label = `${name}: ${sealed ? 'sealed' : 'waiting'}${isKeyHolder ? ', key holder' : ''}`;

  if (!sealed) {
    return (
      <div
        aria-label={label}
        className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-vault-steel-700 px-1 py-2 text-vault-gold-soft/45"
      >
        <span className="text-base leading-none" aria-hidden="true">
          ?
        </span>
        <span className="flex max-w-full items-center gap-1 truncate text-[11px]">
          {name}
          {isKeyHolder && <Icon name="key" className="h-3 w-3 shrink-0 text-vault-gold" />}
        </span>
      </div>
    );
  }

  return (
    <div
      aria-label={label}
      className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 ${
        isYou ? 'border-vault-gold bg-vault-gold/10 text-vault-gold' : 'border-vault-line bg-vault-panel text-vault-gold-soft'
      }`}
    >
      <svg viewBox="0 0 24 16" width="30" height="20" aria-hidden="true">
        <rect x="1" y="1" width="22" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M1 2l11 8 11-8" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="12" cy="10" r="2.6" className="fill-vault-wax" />
      </svg>
      <span className="flex max-w-full items-center gap-1 truncate text-[11px]">
        {isYou ? 'You' : name}
        {isKeyHolder && <Icon name="key" className="h-3 w-3 shrink-0 text-vault-gold" />}
      </span>
    </div>
  );
}
