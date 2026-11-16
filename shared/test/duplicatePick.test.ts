import { describe, expect, it } from 'vitest';
import { isSamePick, normalizePickText, type PickLine } from '../src/index.js';

const bears = (point: number | null, choice: PickLine['choice'] = 'spreadHome'): PickLine => ({
  sport: 'nfl',
  eventId: 'evt1',
  choice,
  point,
});

describe('normalizePickText', () => {
  it('ignores case, extra spaces and the kind of minus sign', () => {
    expect(normalizePickText('  Bears   −2.5 ')).toBe('bears -2.5');
  });
});

describe('isSamePick', () => {
  it('matches board picks on the same side at any line', () => {
    expect(isSamePick({ pickText: 'Bears -2.5', line: bears(-2.5) }, { pickText: 'Bears -3', line: bears(-3) })).toBe(true);
  });

  it('does not match the other side, another market or another game', () => {
    const a = { pickText: 'Bears -2.5', line: bears(-2.5) };
    expect(isSamePick(a, { pickText: 'Panthers +2.5', line: bears(2.5, 'spreadAway') })).toBe(false);
    expect(isSamePick(a, { pickText: 'Bears ML', line: bears(null, 'mlHome') })).toBe(false);
    expect(isSamePick(a, { pickText: 'Bears -2.5', line: { ...bears(-2.5), eventId: 'evt2' } })).toBe(false);
    expect(isSamePick(a, { pickText: 'Bears -2.5', line: { ...bears(-2.5), sport: 'ncaaf' } })).toBe(false);
  });

  it('matches typed picks on normalized text', () => {
    expect(isSamePick({ pickText: 'Jameson Williams Anytime TD' }, { pickText: 'jameson williams  anytime td' })).toBe(true);
    expect(isSamePick({ pickText: 'Bears -2.5' }, { pickText: 'Bears -3' })).toBe(false);
  });

  it('compares text when only one pick came from the board', () => {
    expect(isSamePick({ pickText: 'Bears -2.5', line: bears(-2.5) }, { pickText: 'Bears −2.5' })).toBe(true);
  });
});
