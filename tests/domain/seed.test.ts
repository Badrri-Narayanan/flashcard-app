import { describe, expect, it } from 'vitest';
import { seededRng } from '../../src/domain/seed';

const take = (rng: () => number, n: number) => Array.from({ length: n }, rng);

describe('seededRng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(take(seededRng('deck-1'), 5)).toEqual(take(seededRng('deck-1'), 5));
  });
  it('gives different sequences for different seeds', () => {
    expect(take(seededRng('deck-1'), 5)).not.toEqual(take(seededRng('deck-2'), 5));
  });
  it('stays within [0, 1)', () => {
    for (const v of take(seededRng('x'), 200)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
