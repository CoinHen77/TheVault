import { describe, expect, it } from 'vitest';
import { summarizePickHistory, type HistoryPick } from '../src/index.js';

const pick = (weekId: string, americanOdds: number, result: HistoryPick['result'], units: number | null): HistoryPick => ({
  weekId,
  americanOdds,
  result,
  units,
});

describe('summarizePickHistory', () => {
  it('builds running units, the longest-odds winner and the current streak', () => {
    const s = summarizePickHistory([
      pick('W04', -138, 'win', 0.72),
      pick('W05', 170, 'win', 1.7),
      pick('W06', -112, 'loss', -1),
      pick('W07', -110, 'loss', -1),
      pick('W08', -110, 'pending', null),
    ]);
    expect(s.cumulative).toEqual([
      { weekId: 'W04', units: 0.72 },
      { weekId: 'W05', units: 2.42 },
      { weekId: 'W06', units: 1.42 },
      { weekId: 'W07', units: 0.42 },
    ]);
    expect(s.bestHit?.weekId).toBe('W05');
    expect(s.streak).toEqual({ result: 'loss', count: 2 });
  });

  it('has no best hit or streak before anything wins or is graded', () => {
    expect(summarizePickHistory([pick('W04', -110, 'pending', null)])).toEqual({ cumulative: [], bestHit: null, streak: null });
    expect(summarizePickHistory([pick('W04', -110, 'loss', -1)]).bestHit).toBeNull();
  });
});
