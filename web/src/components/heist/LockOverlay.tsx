import { useEffect, useState } from 'react';
import { useLockReveal } from '../../hooks/LockReveal';
import { COPY } from '../../lib/copy';
import { doorSrc, type DoorState } from './Door';

/** Frame timings in ms from the start of the lock moment. */
const OPENING_AT = 600;
const OPEN_AT = 1300;
const FADE_AT = 2600;
const DONE_AT = 3000;

const COPY_BY_FRAME: Record<DoorState, [string, string]> = {
  closed: [COPY.vaultSealed, 'Every ticket is in.'],
  opening: [COPY.vaultOpening, 'The envelopes are unsealing.'],
  open: [COPY.vaultOpen, `Every pick is revealed. The ${COPY.bookholder} is up.`],
};

/**
 * Full-screen door opening played once at lock (CLAUDE.md H4). It's a
 * button-wrapped overlay so any tap, Skip or Escape dismisses it at once, and
 * it clears itself after about three seconds.
 */
export default function LockOverlay() {
  const { playing, finish } = useLockReveal();
  const [frame, setFrame] = useState<DoorState>('closed');
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!playing) return;
    setFrame('closed');
    setFading(false);
    const timers = [
      setTimeout(() => setFrame('opening'), OPENING_AT),
      setTimeout(() => setFrame('open'), OPEN_AT),
      setTimeout(() => setFading(true), FADE_AT),
      setTimeout(finish, DONE_AT),
    ];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', onKey);
    };
  }, [playing, finish]);

  if (!playing) return null;
  const [title, sub] = COPY_BY_FRAME[frame];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-vault-black/95 px-6 transition-opacity duration-400 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      role="dialog"
      aria-modal="false"
      aria-label="The door is opening"
      onClick={finish}
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="relative h-[240px] w-[260px] max-w-[70vw]">
          {(['closed', 'opening', 'open'] as const).map((state) => {
            const { src, srcSet } = doorSrc(state);
            return (
              <img
                key={state}
                src={src}
                srcSet={srcSet}
                alt=""
                draggable={false}
                className={`absolute inset-0 m-auto max-h-full max-w-full object-contain drop-shadow-[0_14px_30px_rgba(0,0,0,0.7)] transition-[opacity,transform] duration-300 ${
                  frame === state ? 'scale-100 opacity-100' : 'scale-[0.98] opacity-0'
                }`}
              />
            );
          })}
        </div>
        <div aria-live="polite">
          <p className="font-display text-2xl font-bold text-vault-gold">{title}</p>
          <p className="mt-1 text-sm text-vault-gold-soft/70">{sub}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            finish();
          }}
          className="min-h-11 rounded-lg border border-vault-steel-700 px-5 text-sm text-vault-gold-soft/80 transition hover:border-vault-gold/60"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
