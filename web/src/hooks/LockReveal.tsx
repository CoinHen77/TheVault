import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import { doorSrc } from '../components/heist/Door';
import { useVaultData } from './VaultDataProvider';

interface LockRevealState {
  /** The door-opening overlay is on screen. */
  playing: boolean;
  /** Dismiss the overlay now (tap, Skip or Escape). */
  finish: () => void;
  /** Week whose tickets should flip open the next time the Week screen shows them. */
  flipWeekId: string | null;
  /** Called by the Week screen once it has flipped the tickets. */
  consumeFlip: () => void;
}

const LockRevealContext = createContext<LockRevealState | null>(null);

/** Remembered in memory as well, so a browser with storage blocked still plays once per session, not on every render. */
const seenThisSession = new Set<string>();

function hasSeen(key: string): boolean {
  if (seenThisSession.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function markSeen(key: string): void {
  seenThisSession.add(key);
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Storage blocked (private mode etc.): the in-memory set still covers this session.
  }
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The lock moment (CLAUDE.md H4). Plays once per week per device: the first
 * time this device sees the current week locked (or grading), whether that's
 * live at lock (Friday 4:00 PM, or earlier if the Admin opens the vault early) or on the next visit. The "seen" flag is written before the
 * animation starts, so a reload mid-animation doesn't replay it.
 */
export function LockRevealProvider({ children }: { children: ReactNode }) {
  const { season, week } = useVaultData();
  const [playing, setPlaying] = useState(false);
  const [, setFlipVersion] = useState(0);

  const revealed = week?.status === 'locked' || week?.status === 'grading';
  const seenKey = season && week ? `vault:lock-seen:${season.id}:${week.id}` : null;
  // Tracked separately from the door: the tickets flip the first time the Week
  // screen shows them, which may be a later visit than the one that played the door.
  const flipKey = season && week ? `vault:flip-seen:${season.id}:${week.id}` : null;
  const flipWeekId = revealed && week && flipKey && !hasSeen(flipKey) ? week.id : null;

  // While the week is open, warm the cache so the opening/open frames are ready at lock.
  useEffect(() => {
    if (week?.status !== 'open') return;
    for (const state of ['opening', 'open'] as const) {
      const img = new Image();
      img.srcset = doorSrc(state).srcSet;
      img.src = doorSrc(state).src;
    }
  }, [week?.status]);

  useEffect(() => {
    if (!seenKey || !revealed || hasSeen(seenKey)) return;
    markSeen(seenKey);
    if (prefersReducedMotion()) {
      if (flipKey) markSeen(flipKey);
      setFlipVersion((v) => v + 1);
      return;
    }
    setPlaying(true);
  }, [seenKey, flipKey, revealed]);

  const finish = useCallback(() => setPlaying(false), []);
  const consumeFlip = useCallback(() => {
    if (flipKey) markSeen(flipKey);
    setFlipVersion((v) => v + 1);
  }, [flipKey]);

  return <LockRevealContext value={{ playing, finish, flipWeekId, consumeFlip }}>{children}</LockRevealContext>;
}

export function useLockReveal(): LockRevealState {
  const ctx = use(LockRevealContext);
  if (!ctx) throw new Error('useLockReveal must be used within a LockRevealProvider');
  return ctx;
}
