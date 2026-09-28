import { describe, expect, it } from 'vitest';
import { decideNextBookholder, type BookholderCandidate } from '../src/bookholder.js';

// SPEC.md §9.1 reference week fixture.
describe('decideNextBookholder — §9.1 fixture', () => {
  it('gives the Book to P2 (-112, the longest odds among the winners)', () => {
    const candidates: BookholderCandidate[] = [
      { playerId: 'P1', odds: -138, result: 'win', seasonUnits: 0, weeksBoughtIn: 1 },
      { playerId: 'P2', odds: -112, result: 'win', seasonUnits: 0, weeksBoughtIn: 1 },
      { playerId: 'P3', odds: 170, result: 'loss', seasonUnits: 0, weeksBoughtIn: 1 },
      { playerId: 'P4', odds: -115, result: 'loss', seasonUnits: 0, weeksBoughtIn: 1 },
      { playerId: 'P5', odds: -112, result: 'loss', seasonUnits: 0, weeksBoughtIn: 1 },
      { playerId: 'P6', odds: -174, result: 'win', seasonUnits: 0, weeksBoughtIn: 1 },
      { playerId: 'P7', odds: -110, result: 'loss', seasonUnits: 0, weeksBoughtIn: 1 },
      { playerId: 'P8', odds: 180, result: 'loss', seasonUnits: 0, weeksBoughtIn: 1 },
    ];

    const decision = decideNextBookholder({ currentBookholderId: 'P2', candidates });

    expect(decision.nextBookholderId).toBe('P2');
    expect(decision.rule).toBe('win');
    expect(decision.tiebreakUsed).toBe('none');
    expect(decision.candidates.sort()).toEqual(['P1', 'P2', 'P6']);
  });
});

// SPEC.md §9.2 Book-earning edge cases.
describe('decideNextBookholder — §9.2 edge cases', () => {
  it('no wins, one push → the push owner gets the Book', () => {
    const candidates: BookholderCandidate[] = [
      { playerId: 'P1', odds: -110, result: 'loss', seasonUnits: 0, weeksBoughtIn: 1 },
      { playerId: 'P2', odds: -120, result: 'push', seasonUnits: 0, weeksBoughtIn: 1 },
      { playerId: 'P3', odds: -105, result: 'loss', seasonUnits: 0, weeksBoughtIn: 1 },
    ];

    const decision = decideNextBookholder({ currentBookholderId: 'P1', candidates });

    expect(decision.nextBookholderId).toBe('P2');
    expect(decision.rule).toBe('push');
    expect(decision.tiebreakUsed).toBe('none');
  });

  it('no wins, two pushes at +150 and -110 → the +150 push gets the Book', () => {
    const candidates: BookholderCandidate[] = [
      { playerId: 'P1', odds: 150, result: 'push', seasonUnits: 0, weeksBoughtIn: 1 },
      { playerId: 'P2', odds: -110, result: 'push', seasonUnits: 0, weeksBoughtIn: 1 },
      { playerId: 'P3', odds: -200, result: 'loss', seasonUnits: 0, weeksBoughtIn: 1 },
    ];

    const decision = decideNextBookholder({ currentBookholderId: 'P1', candidates });

    expect(decision.nextBookholderId).toBe('P1');
    expect(decision.rule).toBe('push');
  });

  it('all losses → the current Bookholder keeps the Book', () => {
    const candidates: BookholderCandidate[] = [
      { playerId: 'P1', odds: -110, result: 'loss', seasonUnits: 0, weeksBoughtIn: 1 },
      { playerId: 'P2', odds: 150, result: 'loss', seasonUnits: 0, weeksBoughtIn: 1 },
    ];

    const decision = decideNextBookholder({ currentBookholderId: 'P3', candidates });

    expect(decision.nextBookholderId).toBe('P3');
    expect(decision.rule).toBe('all_losses_keep');
    expect(decision.tiebreakUsed).toBe('none');
    expect(decision.candidates).toEqual([]);
  });

  it('two winners at the same odds: more season units wins', () => {
    const candidates: BookholderCandidate[] = [
      { playerId: 'P1', odds: -110, result: 'win', seasonUnits: 5, weeksBoughtIn: 1 },
      { playerId: 'P2', odds: -110, result: 'win', seasonUnits: 10, weeksBoughtIn: 1 },
    ];

    const decision = decideNextBookholder({ currentBookholderId: 'P1', candidates });

    expect(decision.nextBookholderId).toBe('P2');
    expect(decision.tiebreakUsed).toBe('units');
  });

  it('same odds and units: more weeks bought in wins', () => {
    const candidates: BookholderCandidate[] = [
      { playerId: 'P1', odds: -110, result: 'win', seasonUnits: 5, weeksBoughtIn: 3 },
      { playerId: 'P2', odds: -110, result: 'win', seasonUnits: 5, weeksBoughtIn: 7 },
    ];

    const decision = decideNextBookholder({ currentBookholderId: 'P1', candidates });

    expect(decision.nextBookholderId).toBe('P2');
    expect(decision.tiebreakUsed).toBe('weeks');
  });

  it('same odds, units and weeks: a coin flip decides, and it is recorded', () => {
    const candidates: BookholderCandidate[] = [
      { playerId: 'P1', odds: -110, result: 'win', seasonUnits: 5, weeksBoughtIn: 3 },
      { playerId: 'P2', odds: -110, result: 'win', seasonUnits: 5, weeksBoughtIn: 3 },
    ];

    // Injected random source, so the coin flip is deterministic for the test.
    const decision = decideNextBookholder({
      currentBookholderId: 'P1',
      candidates,
      random: () => 0.99,
    });

    expect(decision.tiebreakUsed).toBe('coin_flip');
    expect(decision.nextBookholderId).toBe('P2');
    expect(decision.coinFlipResult).toBe('P2');

    const decisionOtherFlip = decideNextBookholder({
      currentBookholderId: 'P1',
      candidates,
      random: () => 0,
    });
    expect(decisionOtherFlip.nextBookholderId).toBe('P1');
  });

  it("the Bookholder's own pick is eligible to win the next Book", () => {
    const candidates: BookholderCandidate[] = [
      { playerId: 'P1', odds: -110, result: 'win', seasonUnits: 0, weeksBoughtIn: 1 },
      { playerId: 'P2', odds: -200, result: 'loss', seasonUnits: 0, weeksBoughtIn: 1 },
    ];

    // P1 is both the current Bookholder and a candidate.
    const decision = decideNextBookholder({ currentBookholderId: 'P1', candidates });

    expect(decision.nextBookholderId).toBe('P1');
    expect(decision.rule).toBe('win');
  });
});
