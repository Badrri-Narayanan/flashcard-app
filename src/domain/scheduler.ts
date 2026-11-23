import { createEmptyCard, fsrs, generatorParameters, type Card as FsrsCard, type Grade } from 'ts-fsrs';
import { baseRecord, now } from './ids';
import type { Id, Rating, ReviewItem, Variant } from './types';

const SUSPENDED_DUE = Number.MAX_SAFE_INTEGER;
const DAY_MS = 86_400_000;

const fuzzScheduler = fsrs(generatorParameters({ enable_fuzz: true }));
const plainScheduler = fsrs(generatorParameters({ enable_fuzz: false }));

export function newReviewItem(cardId: Id, deckId: Id, variant: Variant, suspended = false): ReviewItem {
  return {
    ...baseRecord(),
    cardId,
    deckId,
    variant,
    due: suspended ? SUSPENDED_DUE : now(),
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: null,
  };
}

function toFsrsCard(item: ReviewItem, at: number): FsrsCard {
  if (item.state === 0 && item.reps === 0) {
    const empty = createEmptyCard(new Date(at));
    return { ...empty, due: new Date(item.due) };
  }
  return {
    due: new Date(item.due),
    stability: item.stability,
    difficulty: item.difficulty,
    scheduled_days: item.scheduledDays,
    learning_steps: item.learningSteps ?? 0,
    reps: item.reps,
    lapses: item.lapses,
    state: item.state,
    last_review: item.lastReview === null ? undefined : new Date(item.lastReview),
  };
}

function fromFsrsCard(item: ReviewItem, card: FsrsCard, at: number): ReviewItem {
  return {
    ...item,
    updatedAt: at,
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: item.lastReview === null ? 0 : Math.max(0, Math.floor((at - item.lastReview) / DAY_MS)),
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as ReviewItem['state'],
    lastReview: at,
  };
}

export function rate(item: ReviewItem, rating: Rating, at: number, opts?: { fuzz?: boolean }): ReviewItem {
  const scheduler = opts?.fuzz === false ? plainScheduler : fuzzScheduler;
  const { card } = scheduler.next(toFsrsCard(item, at), new Date(at), rating as Grade);
  return fromFsrsCard(item, card, at);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatInterval(ms: number): string {
  if (ms < MINUTE) return '<1m';
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const years = days / 365;
  return years < 10 ? `${Math.round(years * 10) / 10}y` : `${Math.round(years)}y`;
}

export function previewIntervals(item: ReviewItem, at: number): Record<Rating, string> {
  const preview = plainScheduler.repeat(toFsrsCard(item, at), new Date(at));
  const label = (g: Grade) => formatInterval(preview[g].card.due.getTime() - at);
  return { 1: label(1), 2: label(2), 3: label(3), 4: label(4) };
}
