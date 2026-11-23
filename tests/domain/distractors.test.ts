import { describe, expect, it } from 'vitest';
import { canQuiz, pickOptions } from '../../src/domain/distractors';
import { baseRecord } from '../../src/domain/ids';
import { mulberry32 } from '../../src/domain/queue';
import type { Card } from '../../src/domain/types';

function mk(over: Partial<Card> = {}): Card {
  return {
    ...baseRecord(), deckId: 'd', type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
    tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
  };
}
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function basicPool(n: number, over: (i: number) => Partial<Card> = () => ({})): Card[] {
  return Array.from({ length: n }, (_, i) => mk({ front: `q${i}`, back: `answer number ${i}`, ...over(i) }));
}

describe('pickOptions', () => {
  it('options contain the correct answer exactly once', () => {
    const pool = basicPool(8);
    const res = pickOptions(pool[0], pool, mulberry32(1))!;
    expect(res.options).toHaveLength(4);
    expect(res.options.filter((o) => o === pool[0].back)).toHaveLength(1);
    expect(res.options[res.correctIndex]).toBe(pool[0].back);
  });

  it('has no duplicate options after normalization', () => {
    const pool = [
      mk({ back: 'Paris' }),
      mk({ back: ' paris ' }),
      mk({ back: 'PARIS' }),
      mk({ back: 'Rome' }),
      mk({ back: 'rome' }),
      mk({ back: 'Berlin' }),
      mk({ back: 'Madrid' }),
    ];
    const res = pickOptions(pool[0], pool, mulberry32(3))!;
    const keys = res.options.map(norm);
    expect(new Set(keys).size).toBe(keys.length);
    expect(res.options).toHaveLength(4);
  });

  it('prefers same-tag distractors', () => {
    const pool = [
      mk({ back: 'target', tags: ['geo'] }),
      mk({ back: 'geo one', tags: ['geo'] }),
      mk({ back: 'geo two', tags: ['geo', 'x'] }),
      mk({ back: 'geo tri', tags: ['geo'] }),
      ...Array.from({ length: 6 }, (_, i) => mk({ back: `other ${i}`, tags: ['misc'] })),
    ];
    for (let seed = 1; seed <= 10; seed++) {
      const res = pickOptions(pool[0], pool, mulberry32(seed))!;
      expect(res.options.sort()).toEqual(['geo one', 'geo tri', 'geo two', 'target']);
    }
  });

  it('prefers similar length (within 50%) among equal tags', () => {
    const pool = [
      mk({ back: 'abcdefghij' }),
      mk({ back: 'abcdefghijk' }),
      mk({ back: 'abcdefghijkl' }),
      mk({ back: 'abcdefgh' }),
      mk({ back: 'x' }),
      mk({ back: 'y'.repeat(60) }),
    ];
    const res = pickOptions(pool[0], pool, mulberry32(2))!;
    expect(res.options).not.toContain('x');
    expect(res.options).not.toContain('y'.repeat(60));
  });

  it('is deterministic with a seeded rng', () => {
    const pool = basicPool(12);
    const a = pickOptions(pool[3], pool, mulberry32(42));
    const b = pickOptions(pool[3], pool, mulberry32(42));
    expect(a).toEqual(b);
  });

  it('mcq uses authored distractors and tops up from the pool', () => {
    const mcq = mk({ type: 'mcq', back: 'right', distractors: ['w1', 'w2', 'w3', 'w4'] });
    const full = pickOptions(mcq, basicPool(6), mulberry32(5))!;
    expect(full.options).toHaveLength(4);
    expect(full.options[full.correctIndex]).toBe('right');
    expect(full.options.filter((o) => o !== 'right').every((o) => ['w1', 'w2', 'w3', 'w4'].includes(o))).toBe(true);

    const partial = mk({ type: 'mcq', back: 'right', distractors: ['w1'] });
    const topped = pickOptions(partial, [partial, ...basicPool(6)], mulberry32(5))!;
    expect(topped.options).toHaveLength(4);
    expect(topped.options).toContain('w1');
  });

  it('cloze: correct is the first blank answer; distractors prefer other cloze answers', () => {
    const target = mk({ type: 'cloze', front: 'The {{capital}} of France is {{Paris}}', back: '' });
    const pool = [
      target,
      mk({ type: 'cloze', front: 'x is {{alpha}}' }),
      mk({ type: 'cloze', front: 'y is {{beta}}' }),
      mk({ type: 'cloze', front: 'z is {{gamma}}' }),
      ...basicPool(5),
    ];
    const res = pickOptions(target, pool, mulberry32(7))!;
    expect(res.options[res.correctIndex]).toBe('capital');
    expect(res.options.sort()).toEqual(['alpha', 'beta', 'capital', 'gamma']);
  });

  it('returns null when fewer than 2 distinct options exist', () => {
    const card = mk({ back: 'same' });
    expect(pickOptions(card, [card, mk({ back: 'SAME' })], mulberry32(1))).toBeNull();
  });

  it('returns fewer options when the pool is small but at least 2 are distinct', () => {
    const pool = basicPool(3);
    expect(pickOptions(pool[0], pool, mulberry32(1))!.options).toHaveLength(3);
  });
});

describe('canQuiz', () => {
  it('needs at least 4 non-suspended cards', () => {
    const cards = basicPool(4);
    expect(canQuiz(cards)).toBe(true);
    expect(canQuiz(cards.slice(0, 3))).toBe(false);
    expect(canQuiz([...cards.slice(0, 3), mk({ suspended: true })])).toBe(false);
  });
});
