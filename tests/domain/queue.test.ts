import { describe, expect, it } from 'vitest';
import { buildLearnQueue, computeBudgets, requeue } from '../../src/domain/queue';
import { DEFAULT_DECK_SETTINGS } from '../../src/domain/types';
import type { Deck, Id, ReviewItem, ReviewLog } from '../../src/domain/types';

const MIN = 60_000;

function item(id: string, deckId: string, due = 0, state: ReviewItem['state'] = 0): ReviewItem {
  return {
    id, createdAt: 0, updatedAt: 0, deletedAt: null,
    cardId: `card-${id}`, deckId, variant: 'fwd',
    due, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0,
    reps: 0, lapses: 0, state, lastReview: null,
  };
}

function deck(id: string, newPerDay: number, reviewsPerDay: number): Deck {
  return {
    id, createdAt: 0, updatedAt: 0, deletedAt: null,
    folderId: null, name: id, description: '', color: '', emoji: '', order: 0,
    settings: { ...DEFAULT_DECK_SETTINGS, newPerDay, reviewsPerDay },
    sourceId: null, matchBestMs: null,
  };
}

function log(reviewItemId: string, deckId: string, at: number, rating: ReviewLog['rating'] = 3): ReviewLog {
  return {
    id: `log-${reviewItemId}-${at}`, createdAt: at, updatedAt: at, deletedAt: null,
    reviewItemId, cardId: `card-${reviewItemId}`, deckId, mode: 'learn',
    rating, correct: true, confidence: null, durationMs: 1000, at, dayKey: '2026-01-01',
  };
}

const ids = (q: ReviewItem[]) => q.map((i) => i.id);

describe('buildLearnQueue', () => {
  it('respects per-deck new limit', () => {
    const fresh = ['n1', 'n2', 'n3', 'n4'].map((id) => item(id, 'a'));
    const q = buildLearnQueue({ due: [], fresh, budgets: [{ deckId: 'a', newLeft: 2, reviewsLeft: 10 }], seed: 1 });
    expect(ids(q)).toEqual(['n1', 'n2']);
  });

  it('takes oldest due first up to reviewsLeft', () => {
    const due = [item('r3', 'a', 30), item('r1', 'a', 10), item('r2', 'a', 20)];
    const q = buildLearnQueue({ due, fresh: [], budgets: [{ deckId: 'a', newLeft: 0, reviewsLeft: 2 }], seed: 1 });
    expect(ids(q)).toEqual(['r1', 'r2']);
  });

  it('places one new card after every 4 reviews, remaining new follow', () => {
    const due = Array.from({ length: 9 }, (_, i) => item(`r${i}`, 'a', i));
    const fresh = [item('n1', 'a'), item('n2', 'a'), item('n3', 'a'), item('n4', 'a')];
    const q = buildLearnQueue({ due, fresh, budgets: [{ deckId: 'a', newLeft: 4, reviewsLeft: 9 }], seed: 1 });
    expect(ids(q)).toEqual([
      'r0', 'r1', 'r2', 'r3', 'n1', 'r4', 'r5', 'r6', 'r7', 'n2', 'r8', 'n3', 'n4',
    ]);
  });

  it('folder study interleaves decks', () => {
    const due = [
      item('a1', 'a', 1), item('a2', 'a', 2), item('a3', 'a', 3),
      item('b1', 'b', 1), item('b2', 'b', 2), item('b3', 'b', 3),
    ];
    const budgets = [
      { deckId: 'a', newLeft: 0, reviewsLeft: 3 },
      { deckId: 'b', newLeft: 0, reviewsLeft: 3 },
    ];
    const q = buildLearnQueue({ due, fresh: [], budgets, seed: 7 });
    const decks = q.map((i) => i.deckId);
    expect(decks).toHaveLength(6);
    for (let i = 0; i < 6; i += 2) expect(new Set(decks.slice(i, i + 2))).toEqual(new Set(['a', 'b']));
  });

  it('buildLearnQueue on empty deck returns []', () => {
    expect(buildLearnQueue({ due: [], fresh: [], budgets: [{ deckId: 'a', newLeft: 5, reviewsLeft: 5 }], seed: 1 })).toEqual([]);
    expect(buildLearnQueue({ due: [], fresh: [], budgets: [], seed: 1 })).toEqual([]);
  });

  it('ignores items of decks without a budget', () => {
    const q = buildLearnQueue({ due: [item('x', 'z', 1)], fresh: [item('y', 'z')], budgets: [], seed: 1 });
    expect(q).toEqual([]);
  });

  it('deterministic with seed', () => {
    const due = Array.from({ length: 12 }, (_, i) => item(`r${i}`, ['a', 'b', 'c'][i % 3], 100));
    const budgets = ['a', 'b', 'c'].map((deckId) => ({ deckId, newLeft: 0, reviewsLeft: 10 }));
    const q1 = buildLearnQueue({ due, fresh: [], budgets, seed: 42 });
    const q2 = buildLearnQueue({ due, fresh: [], budgets, seed: 42 });
    expect(ids(q1)).toEqual(ids(q2));
    expect(q1).toHaveLength(12);
  });

  it('different seeds can order equal-due items differently', () => {
    const due = Array.from({ length: 10 }, (_, i) => item(`r${i}`, 'a', 100));
    const budgets = [{ deckId: 'a', newLeft: 0, reviewsLeft: 10 }];
    const orders = new Set([1, 2, 3, 4, 5].map((seed) => ids(buildLearnQueue({ due, fresh: [], budgets, seed })).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('does not mutate inputs', () => {
    const due = [item('r2', 'a', 2), item('r1', 'a', 1)];
    buildLearnQueue({ due, fresh: [], budgets: [{ deckId: 'a', newLeft: 0, reviewsLeft: 2 }], seed: 1 });
    expect(ids(due)).toEqual(['r2', 'r1']);
  });
});

describe('requeue', () => {
  const at = 1_000_000;
  const queue = ['q1', 'q2', 'q3', 'q4'].map((id) => item(id, 'a'));

  it('requeue inserts Again item later in queue', () => {
    const again = item('again', 'a', at + 2 * MIN, 1);
    const out = requeue(queue, again, at);
    expect(ids(out)).toEqual(['q1', 'q2', 'again', 'q3', 'q4']);
    expect(ids(queue)).toEqual(['q1', 'q2', 'q3', 'q4']);
  });

  it('inserts at position 1 when due is imminent, relearning included', () => {
    expect(ids(requeue(queue, item('x', 'a', at, 3), at))).toEqual(['q1', 'x', 'q2', 'q3', 'q4']);
  });

  it('appends when due is later than queue length', () => {
    expect(ids(requeue(queue, item('x', 'a', at + 15 * MIN, 1), at))).toEqual(['q1', 'q2', 'q3', 'q4', 'x']);
  });

  it('inserts into an empty queue', () => {
    expect(ids(requeue([], item('x', 'a', at + MIN, 1), at))).toEqual(['x']);
  });

  it('does not reinsert items due beyond 20 minutes', () => {
    expect(ids(requeue(queue, item('x', 'a', at + 21 * MIN, 1), at))).toEqual(ids(queue));
  });

  it('does not reinsert review/new state items', () => {
    expect(ids(requeue(queue, item('x', 'a', at + MIN, 2), at))).toEqual(ids(queue));
    expect(ids(requeue(queue, item('y', 'a', at + MIN, 0), at))).toEqual(ids(queue));
  });
});

describe('computeBudgets', () => {
  const decks = [deck('a', 5, 10), deck('b', 3, 4)];

  it('returns full settings when no logs', () => {
    expect(computeBudgets(decks, [], new Map())).toEqual([
      { deckId: 'a', newLeft: 5, reviewsLeft: 10 },
      { deckId: 'b', newLeft: 3, reviewsLeft: 4 },
    ]);
  });

  it('counts items first studied today as new, others as reviews', () => {
    const logs = [
      log('n1', 'a', 1000), log('n1', 'a', 2000), // new today, studied twice: counts once
      log('n2', 'a', 1500),
      log('r1', 'a', 1200), // first ever log was earlier
      log('r2', 'b', 1300),
    ];
    const first = new Map<Id, number>([['n1', 1000], ['n2', 1500], ['r1', 10], ['r2', 20]]);
    expect(computeBudgets(decks, logs, first)).toEqual([
      { deckId: 'a', newLeft: 3, reviewsLeft: 9 },
      { deckId: 'b', newLeft: 3, reviewsLeft: 3 },
    ]);
  });

  it('does not count logs without a rating as new studied', () => {
    const logs = [log('n1', 'a', 1000, null)];
    const first = new Map<Id, number>([['n1', 1000]]);
    expect(computeBudgets(decks, logs, first)[0].newLeft).toBe(5);
  });

  it('clamps at 0', () => {
    const logs = ['r1', 'r2', 'r3', 'r4', 'r5'].map((id, i) => log(id, 'b', 100 + i));
    const first = new Map<Id, number>(logs.map((l) => [l.reviewItemId, 1]));
    expect(computeBudgets(decks, logs, first)[1]).toEqual({ deckId: 'b', newLeft: 3, reviewsLeft: 0 });
  });
});
