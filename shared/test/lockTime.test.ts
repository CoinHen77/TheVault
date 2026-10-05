import { describe, expect, it } from 'vitest';
import { etWallClockToMs, nextStandardLockAtMs, nextWeekLockAtMs } from '../src/lockTime.js';

const iso = (ms: number) => new Date(ms).toISOString();

describe('etWallClockToMs', () => {
  it('handles EDT and EST', () => {
    expect(iso(etWallClockToMs(2026, 10, 9, 16))).toBe('2026-10-09T20:00:00.000Z'); // EDT, UTC−4
    expect(iso(etWallClockToMs(2026, 11, 6, 16))).toBe('2026-11-06T21:00:00.000Z'); // EST, UTC−5
  });
});

describe('nextStandardLockAtMs', () => {
  it('returns the same Friday 4 PM when it is still ahead', () => {
    expect(iso(nextStandardLockAtMs(Date.parse('2026-10-06T16:00:00Z')))).toBe('2026-10-09T20:00:00.000Z');
    expect(iso(nextStandardLockAtMs(Date.parse('2026-10-09T19:59:00Z')))).toBe('2026-10-09T20:00:00.000Z');
  });

  it('counts exactly 4 PM as that lock and later Friday as next week', () => {
    expect(iso(nextStandardLockAtMs(Date.parse('2026-10-09T20:00:00Z')))).toBe('2026-10-09T20:00:00.000Z');
    expect(iso(nextStandardLockAtMs(Date.parse('2026-10-09T20:01:00Z')))).toBe('2026-10-16T20:00:00.000Z');
  });

  it('uses the ET date, not the UTC date, late on Friday night', () => {
    // Fri Oct 9, 11 PM ET is already Saturday in UTC.
    expect(iso(nextStandardLockAtMs(Date.parse('2026-10-10T03:00:00Z')))).toBe('2026-10-16T20:00:00.000Z');
  });
});

describe('nextWeekLockAtMs', () => {
  it('moves a Friday lock to the next Friday', () => {
    expect(iso(nextWeekLockAtMs(Date.parse('2026-10-09T20:00:00Z')))).toBe('2026-10-16T20:00:00.000Z');
  });

  it('moves an old Sunday 11 AM lock to the coming Friday', () => {
    expect(iso(nextWeekLockAtMs(Date.parse('2026-10-04T15:00:00Z')))).toBe('2026-10-09T20:00:00.000Z');
  });

  it('keeps 4 PM ET across the end of daylight saving time', () => {
    expect(iso(nextWeekLockAtMs(Date.parse('2026-10-30T20:00:00Z')))).toBe('2026-11-06T21:00:00.000Z');
  });
});
