import Door, { type DoorState } from './Door';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How far through the pick window we are, 0 → 1. Weeks don't store an open
 * time, so the window is taken as the 7 days before `lockAtMs`.
 */
export function lockProgress(lockAtMs: number, nowMs: number): number {
  const start = lockAtMs - WEEK_MS;
  return Math.min(1, Math.max(0, (nowMs - start) / WEEK_MS));
}

/**
 * The vault door inside a gold countdown ring. The ring fills as lock
 * approaches; once the door is open the ring is drawn full.
 */
export default function DoorDial({
  progress,
  state = 'closed',
  size = 150,
}: {
  /** 0 → 1; ignored (drawn full) unless the door is closed. */
  progress: number;
  state?: DoorState;
  size?: number;
}) {
  const r = 70;
  const circumference = 2 * Math.PI * r;
  const filled = state === 'closed' ? Math.min(1, Math.max(0, progress)) : 1;
  const doorHeight = Math.round(size * 0.78);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 150 150" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx="75" cy="75" r={r} fill="none" className="stroke-vault-line" strokeWidth="6" />
        <circle
          cx="75"
          cy="75"
          r={r}
          fill="none"
          className="stroke-vault-gold transition-[stroke-dashoffset] duration-700"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled)}
          transform="rotate(-90 75 75)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Door state={state} height={doorHeight} />
      </div>
    </div>
  );
}
