/**
 * Push notifications (SPEC.md §8 Phase 3, added on request). Pure parts only:
 * the four kinds, each player's preferences, when reminders are due, and the
 * text of every message. Sending lives in /functions.
 */
import type { TimestampLike, WeekType } from './types.js';

const WEEK_NAMES: Record<Exclude<WeekType, 'regular'>, string> = {
  wildcard: 'Wild Card',
  divisional: 'Divisional',
  conference: 'Conference Championship',
  superbowl: 'Super Bowl',
};

/** "Week 5", "Wild Card", … — same as the web app's weekLabel. */
export function notifyWeekName(week: { nflWeek: number | null; type: WeekType }): string {
  return week.type === 'regular' ? `Week ${week.nflWeek}` : WEEK_NAMES[week.type];
}

/** "4:00 PM" in America/New_York. */
function etTime(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(
    new Date(ms),
  );
}

export type NotifyKind = 'reminders' | 'vaultOpen' | 'bookIn' | 'weekResults';
export const NOTIFY_KINDS: NotifyKind[] = ['reminders', 'vaultOpen', 'bookIn', 'weekResults'];

/** `notificationPrefs/{uid}` — written by the player. A missing doc or field means on. */
export type NotificationPrefs = Record<NotifyKind, boolean>;
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  reminders: true,
  vaultOpen: true,
  bookIn: true,
  weekResults: true,
};

export function prefsWithDefaults(prefs: Partial<NotificationPrefs> | null | undefined): NotificationPrefs {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(prefs ?? {}) };
}

/** `pushTokens/{token}` — one per device that turned notifications on. */
export interface PushToken {
  uid: string;
  platform: string;
  createdAt: TimestampLike;
}

/** Which app tab a tap on the notification opens. Mirrors the web app's Tab ids. */
export type NotifyTab = 'dashboard' | 'pick' | 'week' | 'book';

export interface PushMessage {
  title: string;
  body: string;
  tab: NotifyTab;
}

/**
 * Seal-your-pick reminders, by how long before the vault opens they go out:
 * the night before (Thursday 8 PM for a Friday 4 PM opening) and a last call
 * an hour out.
 */
export type ReminderKey = 'eve' | 'lastCall';
export const REMINDER_OFFSETS_MS: Record<ReminderKey, number> = {
  eve: 20 * 60 * 60 * 1000,
  lastCall: 60 * 60 * 1000,
};

/**
 * The reminder to send now, if any. Only the latest one that's due is sent, so
 * a week created late (or a missed run) never fires both at once.
 */
export function dueReminder(
  lockAtMs: number,
  nowMs: number,
  sent: Partial<Record<ReminderKey, boolean>> | undefined,
): ReminderKey | null {
  if (nowMs >= lockAtMs) return null;
  const due = (key: ReminderKey) => nowMs >= lockAtMs - REMINDER_OFFSETS_MS[key];
  if (due('lastCall')) return sent?.lastCall ? null : 'lastCall';
  if (due('eve')) return sent?.eve ? null : 'eve';
  return null;
}

function money(cents: number): string {
  const sign = cents < 0 ? '−' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function signedMoney(cents: number): string {
  return cents > 0 ? `+${money(cents)}` : money(cents);
}

export function reminderMessage(key: ReminderKey, weekName: string, lockAtMs: number): PushMessage {
  return key === 'eve'
    ? {
        title: 'Seal your pick',
        body: `The vault opens tomorrow at ${etTime(lockAtMs)} ET. Your ${weekName} ticket is still blank.`,
        tab: 'pick',
      }
    : { title: 'Last call', body: `The vault opens in an hour. Seal your ${weekName} pick now.`, tab: 'pick' };
}

export function vaultOpenMessage(weekName: string, keyHolderName: string, forKeyHolder: boolean): PushMessage {
  return forKeyHolder
    ? { title: 'You hold the key', body: `The vault is open for ${weekName}. Place your bets.`, tab: 'book' }
    : { title: 'The vault is open', body: `Every ${weekName} pick is revealed. ${keyHolderName} is up.`, tab: 'week' };
}

export function bookInMessage(keyHolderName: string, betCount: number, stakedCents: number): PushMessage {
  return {
    title: "The Book's in",
    body: `${keyHolderName} placed ${betCount} bet${betCount === 1 ? '' : 's'} for ${money(stakedCents)}. See what's riding.`,
    tab: 'book',
  };
}

export function weekResultsMessage(s: {
  weekName: string;
  record: { w: number; l: number; p: number };
  bookNetCents: number;
  nextKeyHolderName: string;
  forNextKeyHolder: boolean;
  nextWeekName: string | null;
}): PushMessage {
  const summary = `Crew ${s.record.w}-${s.record.l}-${s.record.p}, Book ${signedMoney(s.bookNetCents)}.`;
  if (s.forNextKeyHolder) {
    return {
      title: 'You earned the key',
      body: `${s.weekName} is closed. ${summary} You run the Book${s.nextWeekName ? ` for ${s.nextWeekName}` : ''}.`,
      tab: 'dashboard',
    };
  }
  return {
    title: `${s.weekName} results`,
    body: `${summary} ${s.nextKeyHolderName} has the key.`,
    tab: 'dashboard',
  };
}
