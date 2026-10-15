import { describe, expect, it } from 'vitest';
import {
  LINE_MOVE_ALERT_CENTS,
  findPickLine,
  isPickLine,
  priceAtOpen,
  lineLabel,
  lineMove,
  lineMoveMessage,
  oddsCents,
  type OddsGameBase,
} from '../src/index.js';

const game: OddsGameBase = {
  eventId: 'evt1',
  homeTeam: 'Carolina Panthers',
  awayTeam: 'Chicago Bears',
  lines: { spreadAway: { odds: -115, point: -3 }, mlHome: { odds: 120, point: null } },
};

describe('oddsCents', () => {
  it('puts favorites and underdogs on one scale', () => {
    expect(oddsCents(-110)).toBe(-10);
    expect(oddsCents(105)).toBe(5);
    expect(oddsCents(105) - oddsCents(-105)).toBe(10);
  });
});

describe('lineMove', () => {
  it('flags an odds move at the alert threshold, not below it', () => {
    expect(LINE_MOVE_ALERT_CENTS).toBe(5);
    expect(lineMove({ odds: -110, point: -2.5 }, { odds: -114, point: -2.5 })).toEqual({
      oddsCents: -4,
      pointChanged: false,
      significant: false,
    });
    expect(lineMove({ odds: -110, point: -2.5 }, { odds: -110 - LINE_MOVE_ALERT_CENTS, point: -2.5 }).significant).toBe(true);
  });

  it('counts a better price as positive and crosses even money', () => {
    expect(lineMove({ odds: -105, point: null }, { odds: 110, point: null })).toMatchObject({ oddsCents: 15, significant: true });
  });

  it('flags any point change even when the price is the same', () => {
    expect(lineMove({ odds: -110, point: -2.5 }, { odds: -110, point: -3 })).toMatchObject({
      oddsCents: 0,
      pointChanged: true,
      significant: true,
    });
  });
});

describe('isPickLine', () => {
  const ok = { sport: 'nfl', eventId: 'evt1', choice: 'spreadAway', point: -2.5 };
  it('accepts a board line', () => {
    expect(isPickLine(ok)).toBe(true);
    expect(isPickLine({ ...ok, choice: 'mlHome', point: null })).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isPickLine(null)).toBe(false);
    expect(isPickLine({ ...ok, sport: 'nba' })).toBe(false);
    expect(isPickLine({ ...ok, choice: 'teaser' })).toBe(false);
    expect(isPickLine({ ...ok, eventId: '' })).toBe(false);
    expect(isPickLine({ ...ok, point: 'x' })).toBe(false);
    expect(isPickLine({ ...ok, extra: true })).toBe(false);
  });
});

describe('findPickLine and labels', () => {
  it('finds the current line, or null when DraftKings dropped it', () => {
    expect(findPickLine([game], { sport: 'nfl', eventId: 'evt1', choice: 'spreadAway', point: -2.5 })?.line).toEqual({
      odds: -115,
      point: -3,
    });
    expect(findPickLine([game], { sport: 'nfl', eventId: 'evt1', choice: 'over', point: 44 })).toBeNull();
    expect(findPickLine([game], { sport: 'nfl', eventId: 'gone', choice: 'spreadAway', point: -2.5 })).toBeNull();
  });

  it('writes the push text', () => {
    expect(lineLabel(game, 'spreadAway', game.lines.spreadAway!)).toBe('Bears -3 (-115)');
    expect(lineLabel(game, 'mlHome', game.lines.mlHome!)).toBe('Panthers ML (+120)');
    expect(lineMoveMessage('Bears -2.5 (-110)', 'Bears -3 (-115)')).toEqual({
      title: 'Your line moved',
      body: 'You sealed Bears -2.5 (-110). DraftKings has it at Bears -3 (-115) now, and the line when the vault opens is what counts. Reseal, pick something else, or keep it.',
      tab: 'pick',
    });
  });
});

describe('priceAtOpen', () => {
  const sealed = {
    pickText: 'Bears -2.5',
    americanOdds: -110,
    line: { sport: 'nfl' as const, eventId: 'evt1', choice: 'spreadAway' as const, point: -2.5 },
  };

  it('moves the pick to the line at vault open, point and all, keeping the seal', () => {
    expect(priceAtOpen({ ...sealed, lineNow: { odds: -115, point: -3, pickText: 'Bears -3' } })).toEqual({
      pickText: 'Bears -3',
      americanOdds: -115,
      line: { ...sealed.line, point: -3 },
      sealed: { pickText: 'Bears -2.5', americanOdds: -110, point: -2.5 },
    });
  });

  it('re-prices a price-only move', () => {
    expect(priceAtOpen({ ...sealed, lineNow: { odds: -125, point: -2.5, pickText: 'Bears -2.5' } })).toMatchObject({
      pickText: 'Bears -2.5',
      americanOdds: -125,
    });
  });

  it('leaves typed-in, unpriced, unchanged and already re-priced picks alone', () => {
    const now = { odds: -125, point: -2.5, pickText: 'Bears -2.5' };
    expect(priceAtOpen({ pickText: 'Kelce anytime TD', americanOdds: 120 })).toBeNull();
    expect(priceAtOpen(sealed)).toBeNull();
    expect(priceAtOpen({ ...sealed, lineNow: { odds: -110, point: -2.5, pickText: 'Bears -2.5' } })).toBeNull();
    expect(priceAtOpen({ ...sealed, lineNow: now, sealed: { pickText: 'x', americanOdds: -110, point: -2.5 } })).toBeNull();
  });
});
