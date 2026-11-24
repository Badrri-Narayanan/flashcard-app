import type { Card, ReviewItem, ReviewLog } from './types';

export const TROUBLE_LAPSES = 6;
const MIN_ACCURACY_LOGS = 8;
const LOW_ACCURACY = 0.4;
const LONG_BACK_CHARS = 120;
const LIST_MIN_ITEMS = 3;
const LIST_LINE = /^\s*(?:[-*•]|\d+[.)])\s+\S/;

export type Fix = 'split' | 'mnemonic' | 'image' | 'rephrase';

/** Trouble = many lapses, or poor accuracy across enough non-learn (quiz/type/match/cram) answers. */
export function isTrouble(item: ReviewItem, recentLogs: ReviewLog[]): boolean {
  if (item.lapses >= TROUBLE_LAPSES) return true;
  const answers = recentLogs.filter((l) => l.mode !== 'learn');
  if (answers.length < MIN_ACCURACY_LOGS) return false;
  return answers.filter((l) => l.correct).length / answers.length < LOW_ACCURACY;
}

function looksLikeList(back: string): boolean {
  if (back.split('\n').filter((line) => LIST_LINE.test(line)).length >= LIST_MIN_ITEMS) return true;
  return back.split(',').filter((part) => part.trim() !== '').length >= LIST_MIN_ITEMS;
}

export function suggestFixes(card: Card): Fix[] {
  const fixes: Fix[] = [];
  if (card.back.length > LONG_BACK_CHARS || looksLikeList(card.back)) fixes.push('split');
  if (card.mnemonic.trim() === '') fixes.push('mnemonic');
  if (!card.front.includes('media:') && !card.back.includes('media:')) fixes.push('image');
  fixes.push('rephrase');
  return fixes;
}

export interface LeechDeps {
  saveCard: (card: Card) => Promise<void>;
}

/**
 * Hook run after each Learn answer. Flags the card as trouble when it newly qualifies.
 * Only logs newer than the card's last edit count toward the accuracy rule, so fixing a card starts afresh.
 * Returns true when the card was newly flagged.
 */
export async function onAfterLearnReview(
  card: Card,
  item: ReviewItem,
  recentLogs: ReviewLog[],
  deps: LeechDeps,
): Promise<boolean> {
  if (card.trouble) return false;
  if (!isTrouble(item, recentLogs.filter((l) => l.at > card.updatedAt))) return false;
  await deps.saveCard({ ...card, trouble: true });
  return true;
}
