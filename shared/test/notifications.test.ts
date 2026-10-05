import { describe, expect, it } from 'vitest';
import {
  bookInMessage,
  dueReminder,
  notifyWeekName,
  prefsWithDefaults,
  reminderMessage,
  vaultOpenMessage,
  weekResultsMessage,
} from '../src/notifications.js';

const LOCK = Date.parse('2026-10-09T20:00:00Z'); // Fri 4:00 PM ET
const H = 3_600_000;

describe('dueReminder', () => {
  it('sends nothing before Thursday 8 PM', () => {
    expect(dueReminder(LOCK, LOCK - 21 * H, {})).toBeNull();
  });

  it('sends the eve reminder from 20 hours out', () => {
    expect(dueReminder(LOCK, LOCK - 20 * H, {})).toBe('eve');
    expect(dueReminder(LOCK, LOCK - 2 * H, {})).toBe('eve');
    expect(dueReminder(LOCK, LOCK - 2 * H, { eve: true })).toBeNull();
  });

  it('sends the last call from an hour out, and only once', () => {
    expect(dueReminder(LOCK, LOCK - H, { eve: true })).toBe('lastCall');
    expect(dueReminder(LOCK, LOCK - 30 * 60_000, { eve: true, lastCall: true })).toBeNull();
  });

  it('skips a missed eve reminder once the last call is due', () => {
    expect(dueReminder(LOCK, LOCK - 30 * 60_000, {})).toBe('lastCall');
  });

  it('sends nothing at or after the opening', () => {
    expect(dueReminder(LOCK, LOCK, {})).toBeNull();
  });
});

describe('prefsWithDefaults', () => {
  it('treats a missing doc or field as on', () => {
    expect(prefsWithDefaults(null)).toEqual({ reminders: true, vaultOpen: true, bookIn: true, weekResults: true });
    expect(prefsWithDefaults({ bookIn: false }).bookIn).toBe(false);
    expect(prefsWithDefaults({ bookIn: false }).reminders).toBe(true);
  });
});

describe('messages', () => {
  it('names weeks like the app does', () => {
    expect(notifyWeekName({ type: 'regular', nflWeek: 5 })).toBe('Week 5');
    expect(notifyWeekName({ type: 'wildcard', nflWeek: null })).toBe('Wild Card');
  });

  it('uses the real opening time in the eve reminder', () => {
    expect(reminderMessage('eve', 'Week 5', LOCK).body).toBe(
      'The vault opens tomorrow at 4:00 PM ET. Your Week 5 ticket is still blank.',
    );
    expect(reminderMessage('lastCall', 'Week 5', LOCK)).toMatchObject({ title: 'Last call', tab: 'pick' });
  });

  it('gives the key holder their own vault-open message', () => {
    expect(vaultOpenMessage('Week 5', 'Test Four', true)).toMatchObject({ title: 'You hold the key', tab: 'book' });
    expect(vaultOpenMessage('Week 5', 'Test Four', false).body).toBe('Every Week 5 pick is revealed. Test Four is up.');
  });

  it('summarizes the Book', () => {
    expect(bookInMessage('Test Four', 2, 1756).body).toBe("Test Four placed 2 bets for $17.56. See what's riding.");
    expect(bookInMessage('Test Four', 1, 500).body).toMatch(/placed 1 bet for/);
  });

  it('summarizes the week, with a special one for the new key holder', () => {
    const base = { weekName: 'Week 4', record: { w: 2, l: 1, p: 1 }, bookNetCents: -500, nextKeyHolderName: 'Test Four', nextWeekName: 'Week 5' };
    expect(weekResultsMessage({ ...base, forNextKeyHolder: false })).toEqual({
      title: 'Week 4 results',
      body: 'Crew 2-1-1, Book −$5.00. Test Four has the key.',
      tab: 'dashboard',
    });
    expect(weekResultsMessage({ ...base, bookNetCents: 25, forNextKeyHolder: true }).body).toBe(
      'Week 4 is closed. Crew 2-1-1, Book +$0.25. You run the Book for Week 5.',
    );
  });
});
