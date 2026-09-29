import { describe, expect, it } from 'vitest';
import { DEFAULT_BUY_IN_CENTS, withSeasonDefaults } from '../src/season.js';
import type { Season } from '../src/types.js';

const base = {
  name: 'Test season',
  startWeek: 4,
  status: 'active',
  sharpPct: 0.1,
  bookCapPct: 0.25,
  currentWeekId: 'W04',
  totalShares: 0,
  vaultCents: 0,
  sharePrice: 1,
} as const;

describe('withSeasonDefaults', () => {
  it('fills these fields on a season created before they existed', () => {
    const legacy = { ...base } as unknown as Season;
    const s = withSeasonDefaults(legacy);
    expect(s.buyInDefaultsCents).toEqual(DEFAULT_BUY_IN_CENTS);
    expect(s.requiredPreloadCents).toBe(0);
    expect(s.removedPlayerIds).toEqual([]);
  });

  it('keeps values a season already has', () => {
    const custom = { regular: 2000, wildcard: 3000, divisional: 3000, conference: 6000, superbowl: 12000 };
    const s = withSeasonDefaults({
      ...base,
      buyInDefaultsCents: custom,
      requiredPreloadCents: 5000,
      removedPlayerIds: ['P3'],
    } as Season);
    expect(s.buyInDefaultsCents).toEqual(custom);
    expect(s.requiredPreloadCents).toBe(5000);
    expect(s.removedPlayerIds).toEqual(['P3']);
  });

  it('fills week types missing from a partial buy-in table', () => {
    const partial = { ...base, buyInDefaultsCents: { regular: 1500 }, requiredPreloadCents: 0 } as unknown as Season;
    expect(withSeasonDefaults(partial).buyInDefaultsCents).toEqual({ ...DEFAULT_BUY_IN_CENTS, regular: 1500 });
  });

  it('keeps extra fields such as a doc id', () => {
    const s = withSeasonDefaults({ id: '2026', ...base } as Season & { id: string });
    expect(s.id).toBe('2026');
  });
});
