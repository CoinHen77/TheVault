import { describe, expect, it } from 'vitest';
import { unitsForPick } from '../src/units.js';

// SPEC.md §9.1 reference week fixture.
describe('unitsForPick — §9.1 fixture', () => {
  it.each([
    ['P1', -138, 'win', 0.72],
    ['P2', -112, 'win', 0.89],
    ['P3', 170, 'loss', -1.0],
    ['P4', -115, 'loss', -1.0],
    ['P5', -112, 'loss', -1.0],
    ['P6', -174, 'win', 0.57],
    ['P7', -110, 'loss', -1.0],
    ['P8', 180, 'loss', -1.0],
  ] as const)('%s: odds %i, %s → %f units', (_player, odds, result, expected) => {
    expect(unitsForPick(odds, result)).toBeCloseTo(expected, 2);
  });
});

describe('unitsForPick', () => {
  it('pushes are zero', () => {
    expect(unitsForPick(-110, 'push')).toBe(0);
    expect(unitsForPick(150, 'push')).toBe(0);
  });

  it('losses are always -1 regardless of odds', () => {
    expect(unitsForPick(-500, 'loss')).toBe(-1);
    expect(unitsForPick(1000, 'loss')).toBe(-1);
  });

  it('throws on invalid odds', () => {
    expect(() => unitsForPick(50, 'win')).toThrow();
  });
});
