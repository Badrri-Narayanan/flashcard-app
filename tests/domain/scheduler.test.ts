import { describe, expect, it } from 'vitest';
import { formatInterval, newReviewItem, previewIntervals, rate } from '../../src/domain/scheduler';

const T = new Date(2026, 2, 10, 12).getTime();
const DAY = 86_400_000;
const nf = { fuzz: false };

describe('newReviewItem', () => {
  it('creates a state 0 item due now', () => {
    const before = Date.now();
    const i = newReviewItem('c', 'd', 'fwd');
    expect(i).toMatchObject({ cardId: 'c', deckId: 'd', variant: 'fwd', state: 0, reps: 0, lapses: 0, lastReview: null });
    expect(i.due).toBeGreaterThanOrEqual(before);
  });
  it('pushes suspended items to the far future', () => {
    expect(newReviewItem('c', 'd', 'fwd', true).due).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('rate', () => {
  it('Good on a new item moves state off 0 and due > at', () => {
    const item = newReviewItem('c', 'd', 'fwd');
    const next = rate(item, 3, T, nf);
    expect(next.state).not.toBe(0);
    expect(next.due).toBeGreaterThan(T);
    expect(next.reps).toBe(1);
    expect(next.lastReview).toBe(T);
    expect(next.updatedAt).toBe(T);
    expect(next.id).toBe(item.id);
    expect(next.createdAt).toBe(item.createdAt);
  });

  it('Again increments lapses only for review-state items', () => {
    const fresh = newReviewItem('c', 'd', 'fwd');
    expect(rate(fresh, 1, T, nf).lapses).toBe(0);

    let item = fresh;
    let at = T;
    for (let n = 0; n < 12 && item.state !== 2; n++) {
      item = rate(item, 4, at, nf);
      at = Math.max(item.due, at + 1);
    }
    expect(item.state).toBe(2);
    const lapsed = rate(item, 1, at, nf);
    expect(lapsed.lapses).toBe(item.lapses + 1);
    expect(lapsed.state).toBe(3);
  });

  it('round-trips learning steps through the item', () => {
    const learning = rate(newReviewItem('c', 'd', 'fwd'), 3, T, nf);
    expect(learning.state).toBe(1);
    expect(learning.learningSteps).toBe(1);
    expect(rate(learning, 3, learning.due, nf).state).toBe(2);
  });

  it('uses fuzz by default without throwing', () => {
    expect(rate(newReviewItem('c', 'd', 'fwd'), 4, T).due).toBeGreaterThan(T);
  });
});

describe('previewIntervals', () => {
  it('Easy >= Good >= Hard for a review item', () => {
    let item = newReviewItem('c', 'd', 'fwd');
    let at = T;
    for (let n = 0; n < 12 && item.state !== 2; n++) {
      item = rate(item, 4, at, nf);
      at = Math.max(item.due, at + 1);
    }
    const p = previewIntervals(item, at);
    const ms = (s: string) => {
      const v = parseFloat(s);
      return s.endsWith('mo') ? v * 30 : s.endsWith('y') ? v * 365 : s.endsWith('d') ? v : 0;
    };
    expect(ms(p[4])).toBeGreaterThanOrEqual(ms(p[3]));
    expect(ms(p[3])).toBeGreaterThanOrEqual(ms(p[2]));
    expect(Object.keys(p)).toEqual(['1', '2', '3', '4']);
  });

  it('labels new item steps in minutes', () => {
    const p = previewIntervals(newReviewItem('c', 'd', 'fwd'), T);
    expect(p[1]).toBe('1m');
    expect(p[3]).toBe('10m');
  });
});

describe('formatInterval', () => {
  it.each([
    [30_000, '<1m'],
    [10 * 60_000, '10m'],
    [90 * 60_000, '2h'],
    [3 * DAY, '3d'],
    [60 * DAY, '2mo'],
    [547.5 * DAY, '1.5y'],
    [12 * 365 * DAY, '12y'],
  ])('%d ms -> %s', (ms, label) => {
    expect(formatInterval(ms)).toBe(label);
  });
});
