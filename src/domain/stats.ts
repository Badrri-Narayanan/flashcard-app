import { dayKey } from './day';
import type { Card, Id, ReviewItem, ReviewLog } from './types';

const DAY_MS = 86_400_000;
const HEATMAP_DAYS = 365;
const RETENTION_WINDOW_DAYS = 30;

export type HeatLevel = 0 | 1 | 2 | 3 | 4;
export interface HeatCell {
  dayKey: string;
  count: number;
  level: HeatLevel;
}
export interface Streak {
  current: number;
  best: number;
  freezeUsedThisWeek: boolean;
}
export interface DeckBreakdown {
  new: number;
  learning: number;
  review: number;
  suspended: number;
  /** Whole-number percentage, or null when there are no qualifying logs. */
  retention: number | null;
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function keyFromNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(key: string, n: number): string {
  return keyFromNumber(dayNumber(key) + n);
}

/** Day number of the Monday that starts the ISO week containing `n`. */
function weekStart(n: number): number {
  const weekday = (new Date(n * DAY_MS).getUTCDay() + 6) % 7;
  return n - weekday;
}

export function dailyCounts(logs: ReviewLog[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of logs) {
    if (l.deletedAt !== null) continue;
    counts.set(l.dayKey, (counts.get(l.dayKey) ?? 0) + 1);
  }
  return counts;
}

/**
 * A day counts when its count reaches `goal`. One missed day per ISO week (Mon-Sun) is forgiven, and a
 * `today` that has not met the goal yet does not break the streak.
 */
export function streak(counts: Map<string, number>, today: string, goal: number): Streak {
  const todayN = dayNumber(today);
  let first = Infinity;
  for (const [key, count] of counts) {
    const n = dayNumber(key);
    if (count >= goal && n <= todayN && n < first) first = n;
  }
  let current = 0;
  let best = 0;
  let freezeWeek = -1;
  for (let n = first; n <= todayN; n++) {
    if ((counts.get(keyFromNumber(n)) ?? 0) >= goal) {
      current++;
      best = Math.max(best, current);
    } else if (n === todayN) {
      break;
    } else if (current > 0 && freezeWeek !== weekStart(n)) {
      freezeWeek = weekStart(n);
    } else {
      current = 0;
    }
  }
  return { current, best, freezeUsedThisWeek: current > 0 && freezeWeek === weekStart(todayN) };
}

export function heatmap(counts: Map<string, number>, today: string): HeatCell[] {
  const nonZero = [...counts.values()].filter((c) => c > 0).sort((a, b) => a - b);
  const quartile = (p: number) => nonZero[Math.max(0, Math.ceil(p * nonZero.length) - 1)];
  const [q1, q2, q3] = [quartile(0.25), quartile(0.5), quartile(0.75)];
  const todayN = dayNumber(today);
  const cells: HeatCell[] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const key = keyFromNumber(todayN - i);
    const count = counts.get(key) ?? 0;
    const level: HeatLevel = count === 0 ? 0 : count <= q1 ? 1 : count <= q2 ? 2 : count <= q3 ? 3 : 4;
    cells.push({ dayKey: key, count, level });
  }
  return cells;
}

/**
 * Reviews due per study day, starting with the day containing `from`. Overdue items land on day 0; new
 * items (state 0) are not reviews and are skipped. Callers drop items of suspended cards first.
 */
export function forecast(items: ReviewItem[], from: number, days = 14, dayStartHour = 4): number[] {
  const buckets = new Array<number>(days).fill(0);
  const todayN = dayNumber(dayKey(from, dayStartHour));
  for (const item of items) {
    if (item.deletedAt !== null || item.state === 0) continue;
    const offset = Math.max(0, dayNumber(dayKey(item.due, dayStartHour)) - todayN);
    if (offset < days) buckets[offset]++;
  }
  return buckets;
}

/** Learn-mode logs from the last 30 days, minus each review item's first-ever learn log. */
export function retentionLogs(logs: ReviewLog[], firstLearnAt: Map<Id, number>, now: number): ReviewLog[] {
  const since = now - RETENTION_WINDOW_DAYS * DAY_MS;
  return logs.filter(
    (l) => l.deletedAt === null && l.mode === 'learn' && l.at >= since && l.at !== firstLearnAt.get(l.reviewItemId),
  );
}

/** `retentionLogs` must already be filtered to the wanted decks and window (see `retentionLogs`). */
export function deckBreakdown(items: ReviewItem[], cards: Card[], retention: ReviewLog[]): DeckBreakdown {
  const suspended = new Set(cards.filter((c) => c.deletedAt === null && c.suspended).map((c) => c.id));
  const deleted = new Set(cards.filter((c) => c.deletedAt !== null).map((c) => c.id));
  const out: DeckBreakdown = { new: 0, learning: 0, review: 0, suspended: 0, retention: null };
  for (const item of items) {
    if (item.deletedAt !== null || deleted.has(item.cardId)) continue;
    if (suspended.has(item.cardId)) out.suspended++;
    else if (item.state === 0) out.new++;
    else if (item.state === 2) out.review++;
    else out.learning++;
  }
  const rated = retention.filter((l) => l.deletedAt === null && l.mode === 'learn' && l.rating !== null);
  if (rated.length > 0) {
    out.retention = Math.round((rated.filter((l) => (l.rating ?? 0) >= 3).length / rated.length) * 100);
  }
  return out;
}
