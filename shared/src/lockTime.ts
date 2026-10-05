/**
 * The standard weekly lock (SPEC.md §1.1): Friday 4:00 PM America/New_York.
 * Only games kicking off at or after lock are eligible, so Thursday Night
 * Football is out and the Saturday college slate through Monday night is in.
 */
export const LOCK_WEEKDAY = 5; // Friday, as in Date.getUTCDay()
export const LOCK_HOUR_ET = 16;

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC offset of America/New_York at `ms`, in ms (e.g. −4h during EDT). */
function etOffsetMs(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Epoch ms for a wall-clock time in America/New_York (month is 1-based). */
export function etWallClockToMs(year: number, month: number, day: number, hour: number, minute = 0): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle the offset across a DST change.
  let ms = naive - etOffsetMs(naive);
  ms = naive - etOffsetMs(ms);
  return ms;
}

/** The first standard lock (Friday 4:00 PM ET) at or after `fromMs`. */
export function nextStandardLockAtMs(fromMs: number): number {
  const et = new Date(fromMs + etOffsetMs(fromMs)); // ET wall clock, read with UTC getters
  for (let i = 0; i <= 7; i++) {
    const day = new Date(Date.UTC(et.getUTCFullYear(), et.getUTCMonth(), et.getUTCDate() + i));
    if (day.getUTCDay() !== LOCK_WEEKDAY) continue;
    const lockMs = etWallClockToMs(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), LOCK_HOUR_ET);
    if (lockMs >= fromMs) return lockMs;
  }
  throw new Error('unreachable: a Friday always falls within 8 days');
}

/**
 * Default lockAt for the week after one that locks at `currentLockAtMs`: the
 * first Friday 4:00 PM ET at least 5 days later. The 5-day gap lands on next
 * week's Friday whether the current week locks on a Friday or on the older
 * Sunday 11 AM default.
 */
export function nextWeekLockAtMs(currentLockAtMs: number): number {
  return nextStandardLockAtMs(currentLockAtMs + 5 * DAY_MS);
}
