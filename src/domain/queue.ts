import type { Deck, Id, ReviewItem, ReviewLog } from './types';

export interface DeckBudget {
  deckId: Id;
  newLeft: number;
  reviewsLeft: number;
}

const NEW_EVERY_N_REVIEWS = 4;
const REQUEUE_WINDOW_MS = 20 * 60_000;
const MINUTE_MS = 60_000;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function groupByDeck(items: ReviewItem[]): Map<Id, ReviewItem[]> {
  const groups = new Map<Id, ReviewItem[]>();
  for (const it of items) {
    const list = groups.get(it.deckId);
    if (list) list.push(it);
    else groups.set(it.deckId, [it]);
  }
  return groups;
}

/**
 * Remaining daily budgets per deck. An item counts as "new studied today" when its
 * first-ever learn log is its earliest log today and that log carries a rating.
 */
export function computeBudgets(
  decks: Deck[],
  todaysLearnLogs: ReviewLog[],
  firstEverLogAt: Map<Id, number>,
): DeckBudget[] {
  const earliest = new Map<Id, ReviewLog>();
  for (const log of todaysLearnLogs) {
    if (log.mode !== 'learn') continue;
    const prev = earliest.get(log.reviewItemId);
    if (!prev || log.at < prev.at) earliest.set(log.reviewItemId, log);
  }
  const newToday = new Map<Id, number>();
  const reviewedToday = new Map<Id, number>();
  for (const [itemId, log] of earliest) {
    const isNew = log.rating !== null && firstEverLogAt.get(itemId) === log.at;
    const counter = isNew ? newToday : reviewedToday;
    counter.set(log.deckId, (counter.get(log.deckId) ?? 0) + 1);
  }
  return decks.map((deck) => ({
    deckId: deck.id,
    newLeft: Math.max(0, deck.settings.newPerDay - (newToday.get(deck.id) ?? 0)),
    reviewsLeft: Math.max(0, deck.settings.reviewsPerDay - (reviewedToday.get(deck.id) ?? 0)),
  }));
}

function deckSequence(reviews: ReviewItem[], fresh: ReviewItem[]): ReviewItem[] {
  const out: ReviewItem[] = [];
  let nextNew = 0;
  reviews.forEach((review, i) => {
    out.push(review);
    if ((i + 1) % NEW_EVERY_N_REVIEWS === 0 && nextNew < fresh.length) out.push(fresh[nextNew++]);
  });
  return out.concat(fresh.slice(nextNew));
}

export function buildLearnQueue(input: {
  due: ReviewItem[];
  fresh: ReviewItem[];
  budgets: DeckBudget[];
  seed: number;
}): ReviewItem[] {
  const rand = mulberry32(input.seed);
  const dueByDeck = groupByDeck(input.due);
  const freshByDeck = groupByDeck(input.fresh);

  const sequences = shuffled(input.budgets, rand).map((budget) => {
    const reviews = shuffled(dueByDeck.get(budget.deckId) ?? [], rand)
      .sort((a, b) => a.due - b.due)
      .slice(0, budget.reviewsLeft);
    const fresh = (freshByDeck.get(budget.deckId) ?? []).slice(0, budget.newLeft);
    return deckSequence(reviews, fresh);
  });

  const queue: ReviewItem[] = [];
  const longest = Math.max(0, ...sequences.map((s) => s.length));
  for (let i = 0; i < longest; i++) {
    for (const seq of sequences) if (i < seq.length) queue.push(seq[i]);
  }
  return queue;
}

/** Reinserts a learning/relearning item due within the session; never mutates `queue`. */
export function requeue(queue: ReviewItem[], item: ReviewItem, at: number): ReviewItem[] {
  const learning = item.state === 1 || item.state === 3;
  if (!learning || item.due - at > REQUEUE_WINDOW_MS) return [...queue];
  const position = Math.min(queue.length, Math.max(1, Math.ceil((item.due - at) / MINUTE_MS)));
  return [...queue.slice(0, position), item, ...queue.slice(position)];
}
