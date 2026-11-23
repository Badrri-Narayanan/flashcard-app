import { parseClozeNumbers } from './cloze';
import type { Card, CardType, ReviewItem, Variant } from './types';

export function variantsFor(card: Pick<Card, 'type' | 'front'>): Variant[] {
  switch (card.type) {
    case 'reversible':
      return ['fwd', 'rev'];
    case 'cloze': {
      const numbers = parseClozeNumbers(card.front);
      return (numbers.length > 0 ? numbers : [1]).map((n): Variant => `c${n}`);
    }
    default:
      return ['fwd'];
  }
}

export function reconcileVariants(
  existing: ReviewItem[],
  card: Card,
  prevType: CardType,
): { keep: ReviewItem[]; remove: ReviewItem[]; add: Variant[] } {
  const live = existing.filter((i) => i.deletedAt === null);
  if (card.type !== prevType) {
    return { keep: [], remove: live, add: variantsFor(card) };
  }
  const wanted = variantsFor(card);
  const keep = live.filter((i) => wanted.includes(i.variant));
  const remove = live.filter((i) => !wanted.includes(i.variant));
  const kept = new Set(keep.map((i) => i.variant));
  return { keep, remove, add: wanted.filter((v) => !kept.has(v)) };
}
