import { describe, expect, it } from 'vitest';
import { baseRecord } from '../../src/domain/ids';
import { dailyCounts, deckBreakdown, forecast, heatmap, retentionLogs, streak } from '../../src/domain/stats';
import type { Card, ReviewItem, ReviewLog } from '../../src/domain/types';

function log(over: Partial<ReviewLog> = {}): ReviewLog {
  return {
    ...baseRecord(), reviewItemId: 'i1', cardId: 'c1', deckId: 'd1', mode: 'learn', rating: 3, correct: true,
    confidence: null, durationMs: 1000, at: 0, dayKey: '2026-03-02', ...over,
  };
}
function item(over: Partial<ReviewItem> = {}): ReviewItem {
  return {
    ...baseRecord(), cardId: 'c1', deckId: 'd1', variant: 'fwd', due: 0, stability: 1, difficulty: 5, elapsedDays: 0,
    scheduledDays: 0, reps: 0, lapses: 0, state: 2, lastReview: null, ...over,
  };
}
function card(id: string, over: Partial<Card> = {}): Card {
  return {
    ...baseRecord(), id, deckId: 'd1', type: 'basic', front: 'q', back: 'a', distractors: [], mnemonic: '',
    tags: [], langFront: null, langBack: null, suspended: false, trouble: false, ...over,
  };
}
const counts = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('dailyCounts', () => {
  it('counts logs of every mode per dayKey and skips deleted logs', () => {
    const map = dailyCounts([
      log({ dayKey: '2026-03-02' }), log({ dayKey: '2026-03-02', mode: 'quiz' }),
      log({ dayKey: '2026-03-03', mode: 'cram' }), log({ dayKey: '2026-03-03', deletedAt: 5 }),
    ]);
    expect(map.get('2026-03-02')).toBe(2);
    expect(map.get('2026-03-03')).toBe(1);
  });
});

describe('streak', () => {
  it('counts consecutive goal-meeting days', () => {
    const c = counts({ '2026-03-04': 5, '2026-03-05': 5, '2026-03-06': 5 });
    expect(streak(c, '2026-03-06', 5)).toEqual({ current: 3, best: 3, freezeUsedThisWeek: false });
  });

  it('streak forgives one missed day per week', () => {
    // Mon 2 .. Fri 6: Wed 4 missed -> forgiven.
    const c = counts({ '2026-03-02': 5, '2026-03-03': 5, '2026-03-05': 5, '2026-03-06': 5 });
    expect(streak(c, '2026-03-06', 5)).toEqual({ current: 4, best: 4, freezeUsedThisWeek: true });
  });

  it('breaks on a second miss in the same ISO week', () => {
    // Mon 2 met, Tue 3 miss, Wed 4 miss, Thu 5 met, Fri 6 met.
    const c = counts({ '2026-03-02': 5, '2026-03-05': 5, '2026-03-06': 5 });
    expect(streak(c, '2026-03-06', 5).current).toBe(2);
    expect(streak(c, '2026-03-06', 5).best).toBe(2);
  });

  it('allows one freeze in each ISO week', () => {
    // Sun 1 Mar belongs to the previous week (Mon 23 Feb). Miss Sat 28 Feb and Wed 4 Mar: different weeks.
    const c = counts({
      '2026-02-26': 5, '2026-02-27': 5, '2026-03-01': 5, '2026-03-02': 5, '2026-03-03': 5, '2026-03-05': 5,
    });
    expect(streak(c, '2026-03-05', 5).current).toBe(6);
  });

  it('streak not broken by unmet today', () => {
    const c = counts({ '2026-03-04': 5, '2026-03-05': 5, '2026-03-06': 2 });
    expect(streak(c, '2026-03-06', 5).current).toBe(2);
  });

  it('is zero with no history', () => {
    expect(streak(new Map(), '2026-03-06', 5)).toEqual({ current: 0, best: 0, freezeUsedThisWeek: false });
  });

  it('keeps best from an earlier run', () => {
    const c = counts({ '2026-01-05': 5, '2026-01-06': 5, '2026-01-07': 5, '2026-01-08': 5, '2026-03-06': 5 });
    expect(streak(c, '2026-03-06', 5)).toMatchObject({ current: 1, best: 4 });
  });
});

describe('heatmap', () => {
  it('heatmap returns 365 cells ending today', () => {
    const cells = heatmap(counts({ '2026-03-06': 3 }), '2026-03-06');
    expect(cells).toHaveLength(365);
    expect(cells[364].dayKey).toBe('2026-03-06');
    expect(cells[0].dayKey).toBe('2025-03-07');
  });

  it('assigns levels by quartile of non-zero counts', () => {
    const c = counts({ '2026-03-01': 1, '2026-03-02': 2, '2026-03-03': 3, '2026-03-04': 4, '2026-03-05': 100 });
    const byDay = new Map(heatmap(c, '2026-03-06').map((x) => [x.dayKey, x.level]));
    expect(byDay.get('2026-03-06')).toBe(0);
    expect(byDay.get('2026-03-01')).toBe(1);
    expect(byDay.get('2026-03-05')).toBe(4);
    expect(byDay.get('2026-03-03')).toBeGreaterThanOrEqual(2);
  });
});

describe('forecast', () => {
  const from = new Date(2026, 2, 6, 10).getTime();
  const at = (d: number, h: number) => new Date(2026, 2, d, h).getTime();

  it('forecast buckets by study day', () => {
    const items = [
      item({ due: at(6, 12) }), item({ due: at(7, 3) }), // 03:00 is still Mar 6's study day (starts 04:00)
      item({ due: at(7, 5) }), item({ due: at(20, 5) }), // day 14 is outside the window
    ];
    const out = forecast(items, from, 14, 4);
    expect(out).toHaveLength(14);
    expect(out[0]).toBe(2);
    expect(out[1]).toBe(1);
    expect(out.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('counts overdue items on day 0 and ignores new and deleted items', () => {
    const items = [item({ due: at(1, 9) }), item({ due: at(1, 9), state: 0 }), item({ due: at(1, 9), deletedAt: 1 })];
    expect(forecast(items, from, 14, 4)[0]).toBe(1);
  });
});

describe('deckBreakdown', () => {
  it('buckets items by state and excludes suspended and deleted', () => {
    const cards = [card('c1'), card('c2', { suspended: true }), card('c3', { deletedAt: 9 })];
    const items = [
      item({ cardId: 'c1', state: 0 }), item({ cardId: 'c1', state: 1 }), item({ cardId: 'c1', state: 3 }),
      item({ cardId: 'c1', state: 2 }), item({ cardId: 'c2', state: 2 }), item({ cardId: 'c3', state: 2 }),
      item({ cardId: 'c1', state: 2, deletedAt: 3 }),
    ];
    expect(deckBreakdown(items, cards, [])).toEqual({ new: 1, learning: 2, review: 1, suspended: 1, retention: null });
  });

  it('retention only counts learn logs', () => {
    const logs = [
      log({ rating: 3 }), log({ rating: 4 }), log({ rating: 1 }), log({ rating: 2 }),
      log({ mode: 'quiz', rating: 1 }), log({ mode: 'cram', rating: null }),
    ];
    expect(deckBreakdown([], [], logs).retention).toBe(50);
  });

  it('retention is null without qualifying logs', () => {
    expect(deckBreakdown([], [], [log({ mode: 'quiz' })]).retention).toBeNull();
  });
});

describe('retentionLogs', () => {
  const now = new Date(2026, 2, 6, 12).getTime();
  const day = 86_400_000;
  it('keeps learn logs from the last 30 days except each item first learn log', () => {
    const first = log({ reviewItemId: 'a', at: now - 5 * day });
    const later = log({ reviewItemId: 'a', at: now - 2 * day });
    const old = log({ reviewItemId: 'b', at: now - 40 * day });
    const quiz = log({ reviewItemId: 'b', at: now - 1 * day, mode: 'quiz' });
    const firsts = new Map([['a', first.at], ['b', now - 50 * day]]);
    expect(retentionLogs([first, later, old, quiz], firsts, now)).toEqual([later]);
  });
});
