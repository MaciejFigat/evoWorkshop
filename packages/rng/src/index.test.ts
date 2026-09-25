import { describe, expect, it } from 'vitest';
import { mulberry32 } from './index';

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('differs between seeds', () => {
    expect(mulberry32(1).next()).not.toBe(mulberry32(2).next());
  });

  it('int stays inclusive within bounds and hits both ends', () => {
    const rng = mulberry32(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      const n = rng.int(1, 20);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(20);
      seen.add(n);
    }
    expect(seen.size).toBe(20);
  });

  it('shuffle returns a permutation and does not mutate the input', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const out = mulberry32(3).shuffle(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort((x, y) => x - y)).toEqual(items);
    expect(mulberry32(3).shuffle(items)).toEqual(out);
  });
});
